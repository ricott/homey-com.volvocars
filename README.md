# Volvo On Call
Control your Volvo car with Volvo On Call services.

Before adding a car you need to go to app settings and select region. Different parts of the world use different APIs from Volvo On Call so it is important to select the correct region in order to find your car.

When adding a car you are prompted for your Volvo On Call username and password.

## Triggers
- Car left home
- Car came home
- Location changed
- Engine started/stopped
- Heater started/stopped
- Battery level changed (only for PHEVs)
- Charge cable status changed (only for PHEVs)

## Conditions
- Heater is on/off
- Engine is on/off
- Car is (not) at home
- Car is (not) locked
- A door is (not) open
- Door is (not) open

## Actions
- Heater on/off
- Lock/Unlock car

   Unlock action will silently unlock the tailgate/trunk. If trunk is opened then all doors will unlock. For more details please visit [Volvo On Call app: Lock/unlock your car](https://www.volvocars.com/uk/support/article/89d8033fbc4235c8c0a801512a07f946)

- Engine remote start/stop

   There are lots of ifs and buts about this feature and one can question the real use of it. If you have started the engine twice remotely, then you need to start it with a key before you can start it remotely again. For more details please visit [Volvo On Call app: Operating remote start of the car](https://www.volvocars.com/uk/support/article/0d3df457bc7bd531c0a801512a956093). Duration setting for action is only relevant for engine start.

- Honk horn
- Blink lights
- Honk horn and blink lights
- Schedule charging (only for PHEVs)
- Start charging / override scheduled charging (only for PHEVs)

## Settings
- Refresh from car (minutes)

   How frequently Volvo On Call cloud is told to update status from the car. After each status refresh the status in Homey is also refreshed. Each action invocation will automatically trigger a refresh afterwards, in order to show correct status. The car seems to push status to Volvo On Call cloud by itself at least after a drive.

   Default refresh interval is 120 minutes. Please be aware that refreshing status too frequently consumes battery power in your vehicle.

- Refresh from cloud (minutes)

   How frequently the status from the Volvo On Call cloud is refreshed in your Homey. Default value is 5 minutes.

- Refresh position (minutes)

   How frequently the position is refreshed from Volvo On Call cloud. Default value 5 minutes.

- Proximity of home (meters)

   Distance from Homey/home the car can be, and the condition will still state that car is at home.

# Disclaimer
Use this app at your own risk. The authors do not guaranteed the proper functioning of this app. This app attempts to use the same APIs used by the official Volvo On Call mobile app. However, it is possible that use of this app may cause unexpected damage for which nobody but you are responsible. Use of these functions can change the settings on your car and may have negative consequences such as (but not limited to) starting the parking heater.

# Credits
Icons from;
- https://thenounproject.com/fandikur007/
- https://thenounproject.com/ralfschmitzer/
- https://thenounproject.com/LAFS/
- https://thenounproject.com/iconproducer/
- https://thenounproject.com/hrnico/

# Versions
## 1.1.1
- Fixed status refresh bug, solved by adding missing Accept header

## 1.1.0
- Fuel range changed trigger added

## 1.0.9
- VOC status json available as a global token

## 1.0.8
- Added action for scheduling charging
- Added action for overriding scheduled charging

## 1.0.7
- Community link and readme cleanup

## 1.0.6
- New Homey app store adoption

## 1.0.5
- Internal cleanup on how credentials are passed from driver to device during initial creation

## 1.0.4
- Remove non relevant device capabilities, e.g. ICE cars wont see battery status.
- Split refresh settings into two; one setting from car to cloud and one setting from cloud to homey. All in order to limit car battery impact.

## 1.0.3
- Increased security by encrypting your Volvo On Call credentials before persisting them locally on your Homey. Existing credentials will be automatically encrypted after installation of this version.

## 1.0.2
- Added conditions for door(s) open. One condition for any door open and one for checking a specific door open.
- Refresh status default value changed to 10 minutes and default refresh position changed to 15 minutes. This is possible to change in vehicle settings.

## 1.0.1
- Added location changed trigger. For instance to allow triggering a flow when the car parks at work, etc. Use condition logic to check if location tags match desired location.

## 1.0.0
- Triggers added; Engine stopped, Heater stopped

## 0.9.9
- Fixed bug related to start of parking climate

## 0.9.8
- Added debug information in device advanced settings. Last VOC API response for attributes, status and most recent VOC error received when invoking an action.
