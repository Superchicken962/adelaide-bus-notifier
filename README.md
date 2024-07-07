# adelaide-bus-notifier
Script to send discord webhook when specified vehicles are in service.

## How to run  
1. Run `npm install` in project directory - this will install all the project dependencies.
2. Add webhook values, and any vehicles you want to be notified about into `config.json`
3. Start the script with `node index.js`

### Notes
- The script may end at any time, so it is recommended to use either [pm2](https://pm2.keymetrics.io/), or a batch script to auto-restart if it does stop.