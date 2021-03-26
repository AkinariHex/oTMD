const express = require('express')
const cors = require('cors')
const fs = require('fs')
const open = require('open')
const path = require('path')
const fetch = require('node-fetch')

const socket = require('socket.io')
const appexp = express()

const { app, BrowserWindow, Menu, Tray, autoUpdater } = require('electron');

require('update-electron-app')({
	repo: 'AkinariHex/oTMD',
	updateInterval: '1 hour',
	logger: require('electron-log')
})

appexp.use(express.json())
appexp.use(cors())
appexp.use('/teamsimg', express.static('teams'));


//create teams folder at first run
if (!fs.existsSync('./teams')) {
    fs.mkdir('teams', (err) => {
        if (err) {
            return console.error(err);
        }
    })
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

appexp.get('/', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/index.html'))
})

appexp.get('/assets/style.css', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/assets/style.css'))
})

appexp.get('/assets/semantic.min.css', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/assets/semantic.min.css'))
})

appexp.get('/assets/semantic.min.js', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/assets/semantic.min.js'))
})

appexp.get('/assets/countries', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/assets/countries.js'))
})

appexp.get('/assets/scoremodification', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/assets/scoremodification.js'))
})

appexp.get('/assets/fonts/Quicksand-VariableFont_wght.ttf', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/assets/fonts/Quicksand-VariableFont_wght.ttf'))
})

appexp.get('/app.js', cors(), (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/app.js'))
})

appexp.get('/socketio', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/assets/socket.io.min.js'))
})

appexp.get('/settings', (req, res) => {
	res.json(readSettingsJson())
})

appexp.get('/teams', (req, res) => {
	fs.readdir('./teams', async (err, data) => {	
		if(err){
			res.json(['nodata']);
			return
		}

		if(data == ''){
			res.json(['nodata']);
		} else {
			res.json(data)
		}

	})
})


// Default visualizer

appexp.get('/visualizer', cors(), (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/visualizer/visualizer.html'))
})

appexp.get('/visualizer/style.css', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/visualizer/style.css'))
})

appexp.get('/version', (req, res) => {
	res.json({ver: app.getVersion()})
})



// -----------------------------------------------------------------------------


app.on('ready', function() {

    const server = appexp.listen(3000, () => {
        console.log(`Running on http://localhost:${server.address().port}`)
    })

    
    /*let loading = new BrowserWindow({show: false, width: 1000, height: 600, frame: false})
    var mainWindow = null;*/

    var mainWindow = new BrowserWindow({
        width: 1000,
        height: 600,
        //autoHideMenuBar: true,
        useContentSize: true,
        resizable: false,
        darkTheme: true,
        frame: false,
        webPreferences: {
            devTools: true
        },
        titleBarStyle: 'hidden',
        show: false,
		name: 'osu! Tourney Match Displayer'
    });

    mainWindow.webContents.on('dom-ready', () => {
        mainWindow.show();
    })

    mainWindow.loadURL(`http://localhost:${server.address().port}/`); 
    //mainWindow.webContents.openDevTools();


	function createTray() {
		let appIcon = new Tray(path.join(__dirname, "frontend/assets/OTMD_logo_icona.ico"));
		const contextMenu = Menu.buildFromTemplate([
			{
				label: 'Open', click: function () {
					mainWindow.show();
				}
			},
			{
				label: 'Close', click: function () {
					app.isQuiting = true;
					app.quit();
				}
			}
		]);
	
		appIcon.on('double-click', function (event) {
			mainWindow.show();
		});
		appIcon.setToolTip('o!TMD');
		appIcon.setContextMenu(contextMenu);
		return appIcon;
	}


	let tray = null;
	mainWindow.on('minimize', function (event) {
		event.preventDefault();
		if(readSettingsJson().systemTray == true){
			mainWindow.hide();
			tray = createTray();
			return
		}

	});
	
	mainWindow.on('restore', function (event) {
		mainWindow.show();
		tray.destroy();
	});
	
	// init socket server
	const io = socket(server)

	io.on('connection', (socket) => {
		// socket.on('event', async () => {
		// emit to sender
		// socket.emit('event', data)
		// emit to all
		// io.emit('event', data)
		// })


		socket.on('minimizeapp', () => {
            (!mainWindow.isMinimized()) ? mainWindow.minimize() : '';
        })

        socket.on('maximizeapp', () => {
            (!mainWindow.isMaximized()) ? mainWindow.maximize() : mainWindow.unmaximize()
        })

        socket.on('closewinbutton', () => {
            app.exit()
        })

		socket.on('compactUIclick', (status) => {
            let data = readSettingsJson();
			data.compactUI = status;
			fs.writeFileSync('./settings.json', JSON.stringify(data))
        })

		socket.on('systemTrayclick', (status) => {
            let data = readSettingsJson();
			data.systemTray = status;
			fs.writeFileSync('./settings.json', JSON.stringify(data))
        })

		socket.on('save', (data) => {
			fs.writeFileSync('./settings.json', JSON.stringify(data))
			io.emit('new_settings' /* data */)
		})
	})

	
	
	
})

app.on('new-window', function(event, url){
    event.preventDefault();
    open(url);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })


