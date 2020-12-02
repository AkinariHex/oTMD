let clients = []
let data = null

function sendEventsToAll() {
	clients.forEach((c) => c.res.write(`data: ${JSON.stringify(data)}\n\n`))
}

const eventEmitter = () => {
	// Mandatory headers and http status to keep connection open
	const headers = {
		'Content-Type': 'text/event-stream',
		Connection: 'keep-alive',
		'Cache-Control': 'no-cache',
	}
	res.writeHead(200, headers)
	// After client opens connection send all nests as string
	const resource = `data: ${JSON.stringify(data)}\n\n`
	res.write(resource)
	// Generate an id based on timestamp and save res
	// object of client connection on clients list
	// Later we'll iterate it and send updates to each client
	const clientId = Date.now()
	const newClient = {
		id: clientId,
		res,
	}
	clients.push(newClient)
	// When client closes connection we update the clients list
	// avoiding the disconnected one
	req.on('close', () => {
		console.log(`${clientId} Connection closed`)
		clients = clients.filter((c) => c.id !== clientId)
		sendEventsToAll()
	})
}

module.exports = eventEmitter
