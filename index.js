const client = require('mineflayer')
const config = require('config')

/* CONFIGURATION */
const serverIp = config.get("ServerConfiguration.Ip")
const serverPort = config.get("ServerConfiguration.Port")
const version = config.get("ServerConfiguration.Version")
const botCount = config.get("BotConfiguration.Count") // inf for infinite
const delay = config.get("BotConfiguration.Delay") // Millisecond

/* MODULES */
const prefix = config.get("BotConfiguration.Modules.Prefix") // Null for empty
const nameRandomizer = config.get("BotConfiguration.Modules.NameRandomizer") // After prefix
//const chatSpammer = true // TODO
//const authentication = true // TODO
//const useProxy = true // TODO

/* VARIABLES */
botMap = new Map()
let currentBotCount = 0

/* MAIN */
createClients()

/* FUNCTIONS */
function createClients() {
    if (botCount === "inf" ? true : currentBotCount < botCount) {
        currentBotCount++
        setTimeout(() => {
            createBot()
            createClients() // Make it repeat
        }, delay)
    }
}

function createBot() {
    botMap.set(botCount, client.createBot({
        host: serverIp,
        port: serverPort,
        username: prefix + (nameRandomizer ? randomUserName(16 - prefix.length) : ""), // 16 is max for username
        version: version
    }))
    console.log("Bot " + currentBotCount + " sent.")
}

function randomUserName(length) {
    var result = [];
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result.push(characters.charAt(Math.floor(Math.random() *
            charactersLength)));
    }
    return result.join('');
}