const StatsD = require('hot-shots');
// const winston = require('winston');
// const DatadogTransport = require('winston-datadog');

module.exports = function (app) {
  var plugin = {};
  var connectionInfos = {}
  var options
  var positionSubscriptions = {}
  let selfContext = 'vessels.' + app.selfId
  var statusMessage
  var hadError = false

  plugin.id = "signalk-datadog";
  plugin.name = "SignalK Datadog";
  plugin.description = "Plugin that sends data to Datadog";

  plugin.start = function (theOptions) {
    options = theOptions;

    app_key = options.app_key || ""

    const dogstatsd = new StatsD();

    // const ddTransport = new DatadogTransport({
    //   api_key: options.api_key,
    //   app_key: app_key
    // });

    // const logger = new winston.Logger({
    //   transports: [
    //     ddTransport
    //   ]
    // });

    path = options.path;

    localSubscription = {
      "context": "vessels.self",
      subscribe: [{
        path: path,
        period: 1 * 1000
      }]
    }

    app.subscriptionmanager.subscribe(localSubscription,
      [],
      subscription_error,
      delta => {
        delta.updates.forEach(u => {
          u.values.forEach(v => {

            var type = (function (value) {
              switch (typeof value) {
                case "number":
                  return "gauge"
                default:
                  return "unknown";
              }
            })(v.value);

            name = "signalk." + v.path;

            data = {
              src_pgn: u.source.pgn,
              name: name,
              value: v.value,
              type: type
            };

            if (data.type != "unknown") {
              dogstatsd.gauge(data.name, data.value);

            } else {
              app.debug(data);
            }
          });
        });
      }
    );

  };

  plugin.stop = function () {

  };


  plugin.schema = {
    type: 'object',
    required: ['api_key', "path"],
    properties: {
      api_key: {
        type: 'string',
        title: 'Datadog API KEY',
      },
      app_key: {
        type: 'string',
        title: 'Datadog app KEY (optional)',
      },
      path: {
        type: 'string',
        title: 'SignalK path',
        default: "*"
      },
    }
  };

  return plugin;

};
