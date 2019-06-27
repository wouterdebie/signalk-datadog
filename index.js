const winston = require('winston');
const DatadogTransport = require('@shelf/winston-datadog-logs-transport');
const metrics = require('datadog-metrics');
const os = require('os');
const pgns = require('@canboat/pgns');
const { isArray } = require('lodash/fp');

module.exports = function (app) {
  var plugin = {};
  var options;
  var staticTimer;
  var unsubscribes = [];
  var logger;

  plugin.id = 'signalk-datadog';
  plugin.name = 'SignalK Datadog';
  plugin.description = 'Plugin that sends data to Datadog';

  const staticKeys = [
    'name',
    'mmsi',
    'uuid',
    'url',
    'flag',
    'port',
    'design.aisShipType',
    'design.draft',
    'design.length',
    'design.beam',
    'design.keel',
    'design.airHeight',
    'design.rigging',
    'sensors.gps.fromCenter',
    'sensors.gps.fromBow',
    'navigation.speedThroughWaterReferenceType'
  ];

  plugin.start = function (theOptions) {
    options = theOptions;
    var appKey = options.app_key || null;

    metrics.init({ apiKey: options.api_key, appKey: appKey, prefix: 'signalk.' });

    var path = options.path;

    logger = winston.createLogger({
      transports: [
        new DatadogTransport({
          apiKey: options.api_key,
          metadata: {
            host: os.hostname(),
            service: 'signalk'
          }
        })
      ]
    });

    var localSubscription = {
      context: options.context,
      subscribe: [{
        path: path,
        period: options.stream_update_interval * 1000
      }]
    };

    app.subscriptionmanager.subscribe(localSubscription,
      unsubscribes,
      subscriptionError,
      delta => {
        delta.updates.forEach(u => {
          var sourceSrc, type, label, pgnSrc;

          if (u.source && u.source.pgn) {
            label = u.source.label;
            sourceSrc = u.source.src;
            type = u.source.type;
            var pgn = getPgn(u.source.pgn);
            if (pgn) {
              pgnSrc = { pgn: pgn.PGN, id: pgn.Id, description: pgn.Description };
            }
          } else {
            [label, sourceSrc] = u.$source.split('.');
          }

          var src = {
            label: label || '',
            pgn: pgnSrc || {},
            src: sourceSrc || '',
            type: type || ''
          };
          app.debug(src);

          var tags = [
            'src.label:' + src.label,
            'pgn.pgn:' + src.pgn.pgn,
            'pgn.id:' + src.pgn.id,
            'src:' + src.src,
            'type:' + src.type
          ];

          app.debug(tags);
          u.values.forEach(v => {
            var data = { name: v.path, value: v.value };

            if (typeof v.value === 'number') {
              metrics.gauge(data.name, data.value, tags);
            } else {
              if (!staticKeys.includes(data.name)) {
                logger.info(data, { ddsource: 'stream', src: src });
              }
            }
          });
        });
      }
    );

    sendStatic();
    staticTimer = setInterval(() => {
      sendStatic();
    }, options.static_update_interval * 1000);
  };

  function sendStatic() {
    app.debug('Sending static data');
    var values = [{
      name: 'signalk-server-node.version',
      value: app.config.version
    }];

    staticKeys.forEach(path => {
      var val = app.getSelfPath(path);
      if (val) {
        if (val.value) {
          val = val.value;
        }
        values.push({ name: path, value: val });
      }
    });

    values.forEach(function (value) {
      logger.info(value, { ddsource: 'static' });
    });
  }

  function subscriptionError(err) {
    app.error('error: ' + err);
  }

  const getPgn = function (pgn) {
    return organizedPGNs[pgn][0];
  };

  plugin.stop = function () {
    app.debug('STOP');
    unsubscribes.forEach(f => f());
    unsubscribes = [];
    clearInterval(staticTimer);
    staticTimer = null;
  };

  plugin.schema = {
    type: 'object',
    required: ['api_key', 'path', 'context', 'static_update_interval', 'stream_update_interval'],
    properties: {
      api_key: {
        type: 'string',
        title: 'Datadog API key'
      },
      app_key: {
        type: 'string',
        title: 'Datadog APP key (optional)'
      },
      path: {
        type: 'string',
        title: 'SignalK path',
        default: '*'
      },
      context: {
        type: 'string',
        title: 'SignalK context',
        default: 'vessels.self'
      },
      static_update_interval: {
        type: 'number',
        title: 'Static data update interval (s)',
        default: 60
      },
      stream_update_interval: {
        type: 'number',
        title: 'Stream data update interval (s)',
        default: 5
      }
    }
  };

  return plugin;
};

function organizePGNs() {
  const res = {};
  pgns.PGNs.forEach(pgn => {
    if (!res[pgn.PGN]) {
      res[pgn.PGN] = [];
    }
    res[pgn.PGN].push(pgn);
    pgn.Fields = isArray(pgn.Fields) ? pgn.Fields : (pgn.Fields ? [pgn.Fields.Field] : []);
    var reservedCount = 1;
    pgn.Fields.forEach((field) => {
      if (field.Name === 'Reserved') {
        field.Name = `Reserved${reservedCount++}`;
      }
    });
  });
  return res;
}

const organizedPGNs = organizePGNs();
