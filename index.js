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
const chatSpammer = config.get("BotConfiguration.Modules.ChatSpam.Enabled")
const chatSpamContent = config.get("BotConfiguration.Modules.ChatSpam.Content")
const chatSpamDelay = config.get("BotConfiguration.Modules.ChatSpam.Delay")
//const authentication = true // TODO
//const useProxy = true // TODO

/* VARIABLES */
botMap = new Map()
let currentBotCount = 0
let chatSpamVariable = 0

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
    } else {
        if (chatSpammer)
            chatSpam()
    }
}

function chatSpam() {
    if (chatSpamVariable >= botMap.size)
        chatSpamVariable = 0
    chatSpamVariable++
    setTimeout(() => {
        botMap.get(chatSpamVariable).chat(chatSpamContent)
        chatSpam()
    }, chatSpamDelay)
}

function createBot() {
    botMap.set(currentBotCount, client.createBot({
        host: serverIp,
        port: serverPort,
        username: prefix + (nameRandomizer ? randomString(16 - prefix.length) : ""), // 16 is max for username
        version: version
    }))
    console.log("Bot " + currentBotCount + " sent." + "[" + botMap.size + "]")
}

function randomString(length) {
    var result = [];
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result.push(characters.charAt(Math.floor(Math.random() *
            charactersLength)));
    }
    return result.join('');
}