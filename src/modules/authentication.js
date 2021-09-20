let {registerCommand, loginCommand, authenticationEnabled, password} = require("../config.json");
loginCommand = loginCommand.toString().replaceAll('{password}', password)
registerCommand = registerCommand.toString().replaceAll('{password}', password)

module.exports = bot => {
    bot.on('spawn', () => {
        if(authenticationEnabled){
            bot.chat(`${registerCommand}`)
            bot.chat(`${loginCommand}`)
        }
    })
}