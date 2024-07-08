# adelaide-bus-notifier
Script to send discord webhook when specified vehicles are in service.
Notifications are currently sent each time the vehicle is on a new trip, so if a vehicle goes onto a new trip afterwards then a new notification will be sent. This may change in a later version.

## How to run  
1. Run `npm install` in project directory - this will install all the project dependencies.
2. Add webhook values, and any vehicles you want to be notified about into `config.json`
3. Start the script with `node index.js`

## Configuring  
In `config.json`, you can configure the following:
- `discordId` - Your discord ID (only needed if you want it to ping you)
- `pingOnVehicle` - Ping you when a vehicle is found?
- `recheckIntervalSeconds` - How long to wait before checking again on completion.
- `webhooks.vehicleAlert` - Where to send the vehicle message (Discord webhook URL).
- `vehicles` - Array of vehicle IDs that you want to be notified for.

### Notes
- While the script has been set to stay online, it may still end from an unexpected error, so it may benefit you to use either [pm2](https://pm2.keymetrics.io/), or a batch script to auto-restart if it does stop.
- Currently, running the script requires [Node.js](https://nodejs.org/en). Hopefully in the future, this will not be the case.