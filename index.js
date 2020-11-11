const express = require('express')
const cors = require('cors')
const fs = require('fs')
const open = require('open')
const path = require('path')
const WebSocket = require('ws');

const app = express()

// app.use(express.static('public'))
app.use(express.json())
app.use(cors())

app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname, 'index.html'))
})

app.get('/style.css', (req, res) => {
	res.sendFile(path.join(__dirname, 'style.css'))
})

app.get('/assets/pattern.png', (req, res) => {
	res.sendFile(path.join(__dirname, 'assets/pattern.png'))
})

app.get('/app.js', cors(), (req, res) => {
	res.sendFile(path.join(__dirname, 'app.js'))
})

app.get('/settings', (req, res) => {
	let data = null
	try {
		data = fs.readFileSync('./settings.json')
	} catch (err) {
		console.log("file 'settings.json' not found")
	}
	res.json(JSON.parse(data))
})

app.get('/visualizer', cors(), (req, res) => {
	res.sendFile(path.join(__dirname, 'visualizer.html'))
})

app.get('/countries', cors(), (req, res) => {
	res.sendFile(path.join(__dirname, 'countries.js'))
})

app.post('/save', (req, res) => {
	console.log(req.body)
	let data = JSON.stringify(req.body);
	wss.clients.forEach(ws => {
		if (ws.readyState === WebSocket.OPEN)
			ws.send(data);
	});
	fs.writeFileSync('./settings.json', data)
	res.sendStatus(200)
})

const server = app.listen(3000, () => {
	console.log(`Running on http://localhost:${server.address().port}`)
	open(`http://localhost:${server.address().port}`)
})

const wss = new WebSocket.Server({ server });

wss.on('connection', ws => {
	ws.send(fs.readFileSync('./settings.json').toString())
});