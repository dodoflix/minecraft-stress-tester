const client = require('mineflayer')

/* CONFIGURATION */
const serverIp = "127.0.0.1"
const serverPort = "25565"
const botCount = 20 // Inf for infinite
const delay = 100 // Millisecond
const version = "1.16.5"

/* MODULES */
const prefix = "dodo" // Null for empty
const nameRandomizer = true // After prefix
//const chatSpammer = true // TODO
//const authentication = true // TODO
//const useProxy = true //TODO

/* VARIABLES */
botMap = new Map()
let currentBotCount = 0

/* MAIN */
createClients()

/* FUNCTIONS */
function createClients() {
    if (currentBotCount < botCount) {
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