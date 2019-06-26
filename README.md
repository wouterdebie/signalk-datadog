# signalk-datadog
SignalK Node Server Plugin that sends data to [Datadog](https://datadoghq.com)

Metrics data (basically numbers) are sent as metrics. The rest (geo information or other strings)
are sent as logs.

This plugin makes a distinction between stream data and static data. The following paths are currently
treated as static and sent at a different interval than stream data:
```
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
```
