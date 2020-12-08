const express = require('express')
const cors = require('cors')
const fs = require('fs')
const open = require('open')
const path = require('path')
const bodyParser = require('body-parser')

const app = express()

app.use(express.json())
app.use(cors())

let clients = []
// Middleware for GET /events endpoint
function eventsHandler(req, res, next) {
	const headers = {
		'Content-Type': 'text/event-stream',
		Connection: 'keep-alive',
		'Cache-Control': 'no-cache',
	}
	res.writeHead(200, headers)

	const data = readSettingsJson()
	const resource = `data: ${JSON.stringify(data)}\n\n`
	res.write(resource)

	const clientId = Date.now()
	const newClient = {
		id: clientId,
		res,
	}
	clients.push(newClient)

	req.on('close', () => {
		// console.log(`${clientId} Connection closed`)
		clients = clients.filter((c) => c.id !== clientId)
		sendEventsToAll()
	})
}
// Iterate clients list and use write res object method to send new nest
function sendEventsToAll() {
	let data = readSettingsJson()
	clients.forEach((c) => c.res.write(`data: ${JSON.stringify(data)}\n\n`))
}

function readSettingsJson() {
	try {
		let data = JSON.parse(fs.readFileSync('./settings.json'))
		return data
	} catch (error) {
		console.log('file settings.json not found, sending default settings')
		return null
	}
}

app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/index.html'))
})

app.get('/style.css', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/style.css'))
})

app.get('/assets/countries', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/assets/countries.js'))
})

app.get('/app.js', cors(), (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/app.js'))
})

app.get('/settings', (req, res) => {
	res.json(readSettingsJson())
})

app.get('/visualizer', cors(), (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/visualizer.html'))
})

app.post('/save', (req, res) => {
	console.log(req.body)
	fs.writeFileSync('./settings.json', JSON.stringify(req.body))
	sendEventsToAll()
	res.sendStatus(200)
})

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false }))

app.get('/events', eventsHandler)

const server = app.listen(3000, () => {
	console.log(`Running on http://localhost:${server.address().port}`)
	open(`http://localhost:${server.address().port}`)
})
