# Terms of use and privacy

These terms apply to the Volvo app for Homey (app ID `com.volvocars`), referred to below as "the app". The app is developed and maintained by Richard Barkestam, who is responsible for it.

The app is an independent community project. It is not made, endorsed or supported by Volvo Cars or by Athom (the maker of Homey). Volvo and Volvo On Call are trademarks of Volvo Car Corporation.

## The service

The app connects your Volvo car to your Homey. It shows your car's status in Homey and lets you send remote commands to the car from Homey.

- The app is free. There are no fees, subscriptions or ads.
- The app is provided "as is", without warranty of any kind. Volvo can change, limit or stop its APIs at any time, so features can stop working without notice.
- Remote commands such as unlocking the car or starting the engine are sent only when you, or a Homey Flow you created, trigger them. You are responsible for how you use them.
- To the extent permitted by law, the developer is not liable for any damage or loss from using the app, including failed, delayed or unintended commands.

To use the app you need a Volvo ID and a VCC API key from the [Volvo Cars Developer Portal](https://developer.volvocars.com/). Volvo's own terms apply to your Volvo ID and to the Volvo APIs.

## What data the app uses

When you sign in with your Volvo ID, you allow the app to read the following data from Volvo's Connected Vehicle, Energy and Location APIs:

- vehicle details, such as model, model year and VIN
- battery and fuel level, range, charging status and average consumption
- odometer
- door, window, lock and engine status
- the car's location

The app uses this data only to show your car's status in Homey and to let you use it in your Homey Flows, for example to detect when the car arrives home.

## Where your data goes

- **Your Homey.** Data is fetched directly from Volvo to your own Homey and stored there, along with your sign-in tokens and your VCC API key. The developer does not run any server that receives or stores your car data.
- **OpenStreetMap.** To show a street address for the car's location, the app automatically sends the car's coordinates to the [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/) service. The [OSMF privacy policy](https://osmfoundation.org/wiki/Privacy_Policy) applies to that request.
- **Error reports.** When something goes wrong, the app may send an anonymous error report to Sentry, an error-tracking service, so problems can be found and fixed. Reports contain the error message, the app, Homey and Node.js versions, and a pseudonymous Homey ID used to count how many Homeys are affected. They never contain your VIN, location, sign-in tokens, VCC API key, name or IP address.

Your data is never sold or shared for any other purpose.

## Stopping and removing your data

- To stop the app from accessing your car, remove the car from Homey or uninstall the app. Uninstalling the app removes all data it stored on your Homey.
- Error reports are kept for a limited time by Sentry and then deleted automatically.

## Changes and contact

These terms may be updated when the app changes. The latest version is always available at this address.

For questions, problems or requests about your data, open an issue at https://github.com/ricott/homey-com.volvocars/issues.

_Last updated: 5 November 2026_
