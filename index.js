const winston = require('winston');
const DatadogTransport = require('@shelf/winston-datadog-logs-transport');
const metrics = require('datadog-metrics');
const os = require('os');
const pgns = require("@canboat/pgns")
const { flow, first, isArray, isEmpty, propertyOf } = require('lodash/fp')

module.exports = function (app) {
  var plugin = {};
  var options;
  var staticTimer;
  var unsubscribes = [];
  var logger;

  plugin.id = "signalk-datadog";
  plugin.name = "SignalK Datadog";
  plugin.description = "Plugin that sends data to Datadog";

  const staticKeys = [
    "name",
    "mmsi",
    "uuid",
    "url",
    "flag",
    "port",
    "design.aisShipType",
    "design.draft",
    "design.length",
    "design.beam",
    "design.keel",
    "design.airHeight",
    "design.rigging",
    "sensors.gps.fromCenter",
    "sensors.gps.fromBow",
    "navigation.speedThroughWaterReferenceType"
  ];

  plugin.start = function (theOptions) {
    options = theOptions;
    app_key = options.app_key || null

    metrics.init({ apiKey: options.api_key, appKey: app_key, prefix: 'signalk.' });

    path = options.path;

    logger = winston.createLogger({
      transports: [
        new DatadogTransport({
          apiKey: options.api_key, // Datadog API key
          // optional metadata which will be merged with every log message
          metadata: {
            host: os.hostname(),
            service: "signalk",
          }
        })
      ]
    });

    localSubscription = {
      context: options.context,
      subscribe: [{
        path: path,
        period: 1 * 1000
      }]
    }

    app.subscriptionmanager.subscribe(localSubscription,
      unsubscribes,
      subscription_error,
      delta => {
        delta.updates.forEach(u => {
          var pgn = getPgn(u.source.pgn);
          var src = u.source
          src["pgn_data"] = { id: pgn.Id, description: pgn.Description }

          u.values.forEach(v => {
            var type = (function (value) {
              switch (typeof value) {
                case "number":
                  return "gauge"
                case "string":
                  return "string"
                default:
                  return typeof value;
              }
            })(v.value);

            data = { name: v.path, value: v.value };

            if (type == "gauge") {
              metrics.gauge(data.name, data.value);
            } else {
              if (!staticKeys.includes(data.name)) {
                logger.info(data, { ddsource: "stream", src: src });
              }
            }
          });
        });
      }
    );

    sendStatic()
    staticTimer = setInterval(() => {
      sendStatic()
    }, 10000)
  };

  function sendStatic() {
    app.debug("Sending static data");
    var values = [{
      name: "signalk-server-node.version",
      value: app.config.version
    }];

    staticKeys.forEach(path => {
      var val = app.getSelfPath(path);
      if (val) {
        if (val.value) {
          val = val.value
        }
        values.push({ name: path, value: val });
      }
    });

    values.forEach(function (value) {
      logger.info(value, { ddsource: "static" });
    });
  }

  function subscription_error(err) {
    app.error("error: " + err)
  }

  const getPgn = function (pgn) {
    if (organizedPGNs[pgn]) {
      return organizedPGNs[pgn][0]
    } else {
      app.debug("No PGN for " + pgn);
      return {}
    }
  }

  plugin.stop = function () {
    app.debug("STOP");
    unsubscribes.forEach(f => f());
    unsubscribes = [];
    clearInterval(staticTimer);
    staticTimer = null;
  };


  plugin.schema = {
    type: 'object',
    required: ['api_key', "path", "context"],
    properties: {
      api_key: {
        type: 'string',
        title: 'Datadog API key',
      },
      app_key: {
        type: 'string',
        title: 'Datadog APP key (optional)',
      },
      path: {
        type: 'string',
        title: 'SignalK path',
        default: "*"
      },
      context: {
        type: 'string',
        title: "SignalK context",
        default: "vessels.self"
      }
    }
  };

  return plugin;

};

function organizePGNs() {
  const res = {}
  pgns.PGNs.forEach(pgn => {
    if (!res[pgn.PGN]) {
      res[pgn.PGN] = []
    }
    res[pgn.PGN].push(pgn)
    pgn.Fields = isArray(pgn.Fields) ? pgn.Fields : (pgn.Fields ? [pgn.Fields.Field] : [])
    var reservedCount = 1
    pgn.Fields.forEach((field) => {
      if (field.Name === 'Reserved') {
        field.Name = `Reserved${reservedCount++}`
      }
    })
  })
  return res
}

const organizedPGNs = organizePGNs()


