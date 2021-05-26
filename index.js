const express = require('express')
const cors = require('cors')
const fs = require('fs')
const open = require('open')
const path = require('path')
const fetch = require('node-fetch')
const os = require('os')

os.setPriority(-20)

const socket = require('socket.io')
const appexp = express()

const { app, BrowserWindow, Menu, Tray, globalShortcut, Notification } = require('electron');
require('v8-compile-cache');
var { autoUpdater } = require("electron-updater")

autoUpdater.logger = require("electron-log")
autoUpdater.logger.transports.file.level = "info"

appexp.use(express.json())
appexp.use(cors())

let documentsFolder = require("os").userInfo().homedir + '/AppData/Roaming';

appexp.use('/teamsimg', express.static(documentsFolder + '/otmd/teams'));


//create otmd folder in documents if not exist already
if (!fs.existsSync(documentsFolder + '/otmd')) {
    fs.mkdir(documentsFolder + '/otmd', (err) => {
        if (err) {
            return console.error(err);
        }
    })
}

//create teams folder at first run
if (!fs.existsSync(documentsFolder + '/otmd/teams')) {
	fs.mkdir(documentsFolder + '/otmd/teams', (err) => {
		if (err) {
			return console.error(err);
		}
	})
}

//create settings file at first run
if (!fs.existsSync(documentsFolder+'/otmd/settings.json')) {
	let data = {
		"apikey":"",
		"matchid":"",
		"stage":"",
		"nofmaps":"",
		"warmups":"",
		"bestof":"",
		"matchtype":"",
		"userid":"",
		"reverse":"",
		"visualizerstyle":"",
		"oldColors":false,
		"smallVisualizer": false,
		"compactUI":false,
		"systemTray":true,
		"firstRun": true
	}
    fs.writeFileSync(documentsFolder+'/otmd/settings.json', JSON.stringify(data))
}


function readSettingsJson() {
	try {
		let data = JSON.parse(fs.readFileSync(documentsFolder+'/otmd/settings.json'))
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

appexp.get('/assets/odometer.min.js', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/assets/odometer.min.js'))
})

appexp.get('/assets/odometer-theme-minimal.css', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/assets/odometer-theme-minimal.css'))
})

appexp.get('/assets/semantic.min.css', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/assets/semantic.min.css'))
})

appexp.get('/assets/semantic.min.js', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/assets/semantic.min.js'))
})

appexp.get('/assets/clipboard.min.js', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/assets/clipboard.min.js'))
})

appexp.get('/assets/countries', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/assets/countries.js'))
})

appexp.get('/assets/scoremodification', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/assets/scoremodification.js'))
})

appexp.get('/assets/images/blueVSred.png', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/assets/images/blueVSred.png'))
})

appexp.get('/assets/images/redVSblue.png', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/assets/images/redVSblue.png'))
})

appexp.get('/assets/images/winnerRed.png', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/assets/images/winnerRed.png'))
})

appexp.get('/assets/images/winnerBlue.png', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/assets/images/winnerBlue.png'))
})

appexp.get('/assets/fonts/Quicksand-VariableFont_wght.ttf', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/assets/fonts/Quicksand-VariableFont_wght.ttf'))
})

appexp.get('/assets/images/modsIcons/NM.svg', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/assets/images/modsIcons/NM.svg'))
})

appexp.get('/assets/images/modsIcons/HD.svg', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/assets/images/modsIcons/HD.svg'))
})

appexp.get('/assets/images/modsIcons/HR.svg', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/assets/images/modsIcons/HR.svg'))
})

appexp.get('/assets/images/modsIcons/DT.svg', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/assets/images/modsIcons/DT.svg'))
})

appexp.get('/assets/images/modsIcons/EZ.svg', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/assets/images/modsIcons/EZ.svg'))
})

appexp.get('/assets/images/modsIcons/FL.svg', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/assets/images/modsIcons/FL.svg'))
})

appexp.get('/assets/images/modsIcons/NF.svg', (req, res) => {
	res.sendFile(path.join(__dirname, 'frontend/assets/images/modsIcons/NF.svg'))
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
	fs.readdir(documentsFolder + `/otmd/teams`, async (err, data) => {	
		if(err){
			res.json(['nodata']);
			return
		}

		if(data == ''){
			res.json(['nodata']);
		} else {
			let teamimages = [];
			let teamsettings = [];
			data.forEach((file) => {
				if(file.search('.*\.(jpeg|jpg|png)$') === 0){
					teamimages.push(file)
				} else {
					teamsettings.push(file.replace(/\.[^/.]+$/, ""))
					appexp.get(`/teams/${file.replace(/\.[^/.]+$/, "")}`, (req, res) => {
						let datafile = fs.readFileSync(documentsFolder + `/otmd/teams/${file}`, 'utf8');
						res.json(JSON.parse(datafile))
					})
				}
			})
			let finalData = { images: teamimages, settings: teamsettings}
			res.json(finalData)
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

app.setAppUserModelId('osu! Tourney Match Displayer')
app.disableHardwareAcceleration()

app.on('ready', function() {

    const server = appexp.listen(3000, () => {
        console.log(`Running on http://localhost:${server.address().port}`)
    })

	globalShortcut.unregister('Control+Shift+I')

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
            devTools: false,
			nodeIntegration: true
        },
        titleBarStyle: 'hidden',
        show: false,
		name: 'osu! Tourney Match Displayer'
    });

    mainWindow.webContents.on('dom-ready', () => {
        mainWindow.show();
    })
	mainWindow.webContents.setFrameRate(60)

	function showNotification(title, body) {
		const notification = {
		  title: title,
		  body: body,
		  icon: path.join(__dirname, "frontend/assets/OTMD_logo_icona.ico")
		}
		new Notification(notification).show()
	}


	mainWindow.webContents.on('new-window', function(e, url) {
		e.preventDefault();
		require('electron').shell.openExternal(url);
	});

	
	mainWindow.loadURL(`http://localhost:${server.address().port}/`)
	.then(autoUpdater.checkForUpdatesAndNotify())

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

	autoUpdater.on('update-available', () => {
		//
	});

	autoUpdater.on('download-progress', (progressObj) => {
		let log_message = {
			speed: (progressObj.bytesPerSecond / 1000000).toFixed(2),
			percent: Math.round(progressObj.percent)
		}
		io.sockets.emit('update_downloading', log_message)
	})
		

	autoUpdater.on('update-downloaded', () => {
		autoUpdater.quitAndInstall()
	});
	

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
			let data = readSettingsJson();
			data.matchid = '';
			fs.writeFileSync(documentsFolder+'/otmd/settings.json', JSON.stringify(data))
            app.exit()
        })

		socket.on('firstrunwrite', (data) => {
            let data1 = {
				"apikey": data.apikey,
				"matchid":"",
				"stage":"",
				"nofmaps":"",
				"warmups":"",
				"bestof":"",
				"matchtype":"",
				"userid": data.userid,
				"reverse":"",
				"visualizerstyle":"",
				"oldColors":false,
				"smallVisualizer": false,
				"compactUI":false,
				"systemTray":true,
				"firstRun": false
			}
			fs.writeFileSync(documentsFolder+'/otmd/settings.json', JSON.stringify(data1))
        })

		socket.on('changelog_load', () => {
			var md = require('markdown-it')({html: true});
			fetch('https://raw.githubusercontent.com/AkinariHex/oTMD/main/CHANGELOG.md')
			.then((res) => res.text())
			.then((changelogData) => {
				var result = md.render(changelogData)
				appexp.get('/changelog', (req, res) => {
					res.send({changelog: result})
				})
			})
        })

		socket.on('visualizerStyleChange', (value) => {
            let data = readSettingsJson();
			data.visualizerstyle = value;
			fs.writeFileSync(documentsFolder+'/otmd/settings.json', JSON.stringify(data))
			io.emit('new_settings')
        })

		socket.on('oldColorsClick', (status) => {
            let data = readSettingsJson();
			data.oldColors = status;
			fs.writeFileSync(documentsFolder+'/otmd/settings.json', JSON.stringify(data))
			io.emit('new_settings')
        })

		socket.on('smallVisualizerClick', (status) => {
            let data = readSettingsJson();
			data.smallVisualizer = status;
			fs.writeFileSync(documentsFolder+'/otmd/settings.json', JSON.stringify(data))
			io.emit('new_settings')
        })

		socket.on('compactUIclick', (status) => {
            let data = readSettingsJson();
			data.compactUI = status;
			fs.writeFileSync(documentsFolder+'/otmd/settings.json', JSON.stringify(data))
        })

		socket.on('systemTrayclick', (status) => {
            let data = readSettingsJson();
			data.systemTray = status;
			fs.writeFileSync(documentsFolder+'/otmd/settings.json', JSON.stringify(data))
        })

		socket.on('save', (data) => {
			fs.writeFileSync(documentsFolder+'/otmd/settings.json', JSON.stringify(data))
			io.emit('new_settings')
		})

		socket.on('open_team_folder', (data) => {
			require('electron').shell.openPath(documentsFolder + '/otmd/teams')
		})


		socket.on('edit_teamname', (datatoSave) => {
			let datafile = JSON.parse(fs.readFileSync(documentsFolder + `/otmd/teams/${datatoSave.file}`, 'utf8'))
			const { img, file, team_name, players } = datafile
			let newData = { 
				"img": img,
				"file": `${datatoSave.name}.json`,
				"team_name": datatoSave.name,
				"players": players
			}
			fs.writeFileSync(documentsFolder + `/otmd/teams/${datatoSave.file}`, JSON.stringify(newData))
			let nameforimage = datatoSave.file.split('.').slice(0, -1).join('.');
			fs.renameSync(documentsFolder + `/otmd/teams/${datatoSave.file}`, documentsFolder + `/otmd/teams/${datatoSave.name}.json`)
			fs.renameSync(documentsFolder + `/otmd/teams/${nameforimage}.${img}`, documentsFolder + `/otmd/teams/${datatoSave.name}.${img}`)
		})

		socket.on('remove_player', (datatoSave) => {
			let datafile = JSON.parse(fs.readFileSync(documentsFolder + `/otmd/teams/${datatoSave.file}`, 'utf8'))
			const { img, file, team_name, players } = datafile
			players.splice(datatoSave.position - 1, 1);
			let newData = {
				"img": img, 
				"file": file,
				"team_name": team_name,
				"players": players
			}
			fs.writeFileSync(documentsFolder + `/otmd/teams/${datatoSave.file}`, JSON.stringify(newData))
		})

		socket.on('save_team', (datatoSave) => {

			let folder = fs.readdirSync(documentsFolder + '/otmd/teams')
			if(!folder.includes(datatoSave.file)){
				folder.forEach((file) => {
					if(file.search(`${datatoSave.team}.*\.(jpeg|jpg|png)$`) === 0){
						var re = /(?:\.([^.]+))?$/;
						var ext = re.exec(file)[1]; 
						let dataFirst = {
							"img": ext,
							"file": datatoSave.file,
							"team_name": datatoSave.team,
							"players": []
						}
						fs.writeFileSync(documentsFolder + `/otmd/teams/${datatoSave.file}`, JSON.stringify(dataFirst))
					}
				})
			}
			let datafile = JSON.parse(fs.readFileSync(documentsFolder + `/otmd/teams/${datatoSave.file}`, 'utf8'))
			const { img, file, team_name, players } = datafile
			players[datatoSave.position - 1] = { "name": datatoSave.playername, "id": datatoSave.playerid }
			let newData = { 
				"img": img,
				"file": file,
				"team_name": team_name,
				"players": players
			}
			fs.writeFileSync(documentsFolder + `/otmd/teams/${datatoSave.file}`, JSON.stringify(newData))
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

  
