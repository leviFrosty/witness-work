require('./app/launch/hardenWeb').hardenWeb()

const { scrubLaunchAddress } = require('./app/launch/scrubLaunchAddress')

if (scrubLaunchAddress()) require('./app/launch/start').start()
