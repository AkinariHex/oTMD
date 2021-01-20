const express = require('express')
const cors = require('cors')
const fs = require('fs')
const open = require('open')
const path = require('path')

const socket = require('socket.io')
const app = express()

app.use(express.json())
app.use(cors())

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

app.get('/socketio', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/assets/socket.io.min.js'))
})

app.get('/settings', (req, res) => {
	res.json(readSettingsJson())
})

// Default visualizer

app.get('/visualizer', cors(), (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/visualizer/default/visualizer.html'))
})

app.get('/visualizer/default', cors(), (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/visualizer/default/visualizer.html'))
})

app.get('/visualizer/style.css', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/visualizer/default/style.css'))
})

// Rounded visualizer

app.get('/visualizer/rounded', cors(), (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/visualizer/rounded/visualizer.html'))
})

app.get('/visualizer/rounded/style.css', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/visualizer/rounded/style.css'))
})

// Top corners rounded visualizer

app.get('/visualizer/top-rounded', cors(), (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/visualizer/top-rounded/visualizer.html'))
})

app.get('/visualizer/top-rounded/style.css', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/visualizer/top-rounded/style.css'))
})

// Bottom corners rounded visualizer

app.get('/visualizer/bottom-rounded', cors(), (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/visualizer/bottom-rounded/visualizer.html'))
})

app.get('/visualizer/bottom-rounded/style.css', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/visualizer/bottom-rounded/style.css'))
})

// -----------------------------------------------------------------------------

const server = app.listen(3000, () => {
	console.log(`Running on http://localhost:${server.address().port}`)
	open(`http://localhost:${server.address().port}`)
})

const io = socket(server)

io.on('connection', (socket) => {
	// socket.on('event', async () => {
	// emit to sender
	// socket.emit('event', data)
	// emit to all
	// io.emit('event', data)
	// })

	socket.on('save', (data) => {
		fs.writeFileSync('./settings.json', JSON.stringify(data))
		io.emit('new_settings' /* data */)
	})
})
