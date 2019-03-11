# Volvo On Call
Control your Volvo car with Volvo On Call services.

Before adding a car you need to go to app settings and select region. Different parts of the world use different APIs from Volvo On Call so it is important to select the correct region in order to find your car.

When adding a car you are prompted for your Volvo On Call username and password.

## Triggers
- Car left home
- Car came home
- Engine started
- Heater started
- Battery level changed (only works for PHEVs)

## Conditions
- Heater is on/off
- Engine is on/off
- Car is (not) at home
- Car is (not) locked

## Actions
- Heater on/off
- Lock/Unlock car

   Unlock action will silently unlock the tailgate/trunk. If trunk is opened then all doors will unlock. For more details please visit [Volvo On Call app: Lock/unlock your car](https://www.volvocars.com/uk/support/article/89d8033fbc4235c8c0a801512a07f946)

- Engine remote start/stop

   There are lots of ifs and buts about this feature and one can question the real use of it. If you have started the engine twice remotely, then you need to start it with a key before you can start it remotely again. For more details please visit [Volvo On Call app: Operating remote start of the car](https://www.volvocars.com/uk/support/article/0d3df457bc7bd531c0a801512a956093). Duration setting for action is only relevant for engine start.

- Honk horn
- Blink lights
- Honk horn and blink lights


## Settings
- Refresh status (minutes)

   How frequently Volvo On Call cloud is told to update status from the car. After each status refresh the status in Homey is also refreshed. Each action invocation will automatically trigger a refresh afterwards, in order to show correct status.

- Refresh position (minutes)

   How frequently the position is refreshed.

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
