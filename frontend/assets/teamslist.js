
function readFile(file){
    if(file.length != 0){
        socket.emit('addteam_readfile', file[0].path)
    }
    
}

function openTeamsFolder(){
    socket.emit('open_team_folder')
}

function changeTeamName(value, file, team){
    let playerNotEditList = document.getElementById(`team_players_${team}`)
    let meta = playerNotEditList.parentElement;
    let card = meta.parentElement
    let cardContent = card.children[1];
    let title = cardContent.firstElementChild
    title.innerHTML = value;
    let data = { name: value, file: file}
    socket.emit('edit_teamname', data)
    
    $('#teams_button').trigger('click');
    let listEdit = meta.children[1];
    let form = listEdit.children[0];
    let listEditTeam = form.children[0];
    let listEditTeamName = listEditTeam.children[0];
    let	teamnamediv = listEditTeamName.children[0];
    let teamnamedivfield = teamnamediv.children[0];
    let teamnameinput = teamnamedivfield.children[0];
    teamnameinput.setAttribute('onchange', `changeTeamName(this.value, '${value}.json', '${team}')`)
    location.reload()
}

function exportTeam(clickedID){
    socket.emit('export_team', clickedID)
}

function editTeam(clickedID){
        document.getElementById(`team_players_edit_${clickedID}`).style.display = "block";
        document.getElementsByName(`bt_${clickedID}`)[0].style.display = "none"
}

function closeTeam(clickedID){
        document.getElementById(`team_players_edit_${clickedID}`).style.display = "none";
        document.getElementsByName(`bt_${clickedID}`)[0].style.display = "flex"
}

function addPlayer(clickedID, counter, file){
    var count = $(`#listeditteam_players_${clickedID} .item`).length;
    console.log($(`#listeditteam_players_${clickedID} .item`))
    if(count <= 8) {
        let playerlistedit = document.getElementById(`listeditteam_players_${clickedID}`)
        $(`<div class="item" id="${count}-player">
            <div style="height: 45px; margin-right: 0px;" data-tooltip="" data-inverted="" data-position="top center" data-variation="mini"><img src="http://s.ppy.sh/a/"></div>
            <div class="field">
                <input type="text" id="${count}" name="${count}_player" placeholder="userid" onchange="saveTeam(this.value, this.id, '${file}', '${clickedID}')">
                <div id="remove_${count}" onclick="removePlayer(this.id, '${file}', '${clickedID}', '${counter}')" class="ui bottom attached button buttonremplayer">
                    <svg xmlns="http://www.w3.org/2000/svg" style="transform: scale(0.45); position: relative; top: -10.2px;" width="24" height="24" viewBox="0 0 24 24"><path d="M23.954 21.03l-9.184-9.095 9.092-9.174-2.832-2.807-9.09 9.179-9.176-9.088-2.81 2.81 9.186 9.105-9.095 9.184 2.81 2.81 9.112-9.192 9.18 9.1z"/></svg>
                </div>
            </div>
        </div>`).appendTo(playerlistedit)
    }
}

function removePlayer(clickedID, file, team, pos){
        let removefield = document.getElementById(clickedID).parentElement;
        let removeItem = removefield.parentElement;
        let playerNotEditList = document.getElementById(`team_players_${team}`).firstElementChild;
        let currentPlayer = playerNotEditList.children[pos-1]
        removeItem.remove();
        currentPlayer.remove();
        let data = { position: pos, file: file}
        socket.emit('remove_player', data)
}

function saveTeam(value, id, file, team, teamOriginal){
    let input = document.getElementById(id).parentElement;
    let itemInput = input.parentElement;
    let tooltip = itemInput.firstElementChild;
    let imgPlayer = tooltip.firstElementChild;
    let playerNotEditList = document.getElementById(`team_players_${team}`).firstElementChild;
    let currentPlayer = playerNotEditList.children[id-1]
    /* console.log(value + " " + id)
    console.log(itemInput)
     */
    fetch('/settings')
    .then((res) => res.json())
    .then((dataS) => {
        fetch(`https://osu.ppy.sh/api/get_user?k=${dataS.apikey}&u=${value}`)
        .then((res) => res.json())
        .then((osuPlayer) => {

            if(playerNotEditList.className == 'team_player_list_noplayers'){
                playerNotEditList.parentElement.innerHTML = '<div class="list"></div>'
                playerNotEditList = document.getElementById(`team_players_${team}`).firstElementChild
            }

            let data = { playerid: value, playername: osuPlayer[0].username, position: id, file: file, team: teamOriginal}
            if(id <= playerNotEditList.childElementCount && playerNotEditList.childElementCount != 0){
                currentPlayer.src = `http://s.ppy.sh/a/${value}`
            } else {
                playerNotEditList.innerHTML += `<div style="width: 35px; height: 35px; margin-right: 0px;" data-tooltip="${osuPlayer[0].username}" data-inverted="" data-position="bottom center"><img src="http://s.ppy.sh/a/${value}" id="img_player"></div>`
            }
            imgPlayer.src = `http://s.ppy.sh/a/${value}`
            input.children[0].classList.remove('errPlayer')
            socket.emit('save_team', data)
        }).catch((err) => {
            input.children[0].classList.add('errPlayer')
            console.log(err)
        })
    })
        
}









document.querySelector('#teams_button').addEventListener('click', (e) => {

    fetch('/teams')
   .then((res) => res.json())
   .then((data) => {

       const { images, settings, status } = data

       let teamslist = document.querySelector('#teamslist')
       teamslist.innerHTML = `
           <div class="card newcard">
               <div class="addteam" onclick="document.getElementById('addteam-input').click();">
                   <input id="addteam-input" type="file" style="display: none;" onchange="readFile(this.files)"/>
                   <div class="content">
                       <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"><path d="M24 10h-10v-10h-4v10h-10v4h10v10h4v-10h10z"/></svg>
                       <br>
                       Add Team
                   </div>
               </div> 
               <div class="openfolder" id="openfolderteams" onclick="openTeamsFolder()">
                   <div class="content">
                       <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"><path d="M22 22h-20l-2-13h24l-2 13zm.406-15l.594-3h-13c-1.979 0-2.041-.417-3.306-2h-5.694l.605 5h20.801z"/></svg>
                       <br>
                       Open Teams<br>Folder
                   </div>
               </div>
           </div>
       `
       if(status === 0) {
           images.forEach((image) => {
                let teamname = image.replace(/\.[^/.]+$/, "")
                let teamnameForURL = encodeURIComponent(image.replace(/\.[^/.]+$/, "")).trim();
                let team_player_list = `<span class="team_player_list_noplayers" id="${teamname}">No players</span>`;

                if(settings.includes(teamname)){
                    fetch(`/teams/${settings[settings.indexOf(teamname)]}`)
                    .then((res) => res.json())
                    .then((dataTeam) => {
                        const { img, file, team_name, players } = dataTeam
                        var teamnameOriginal = teamname
                        teamname = team_name.split(' ').join('_')
                        let playersText = ""
                        let editList = `<div class="item team">
                                    <div class="field">
                                        <input type="text" name="teamname" id="teamname_input" placeholder="Team Name" value="${team_name}" onchange="changeTeamName(this.value, '${file}', '${teamname}')">
                                    </div>
                                </div>`
                        let counter = 1;
                        players.forEach((player) => {
                            playersText += `<div style="width: 35px; height: 35px; margin-right: 0px;" data-tooltip="${player.name}" data-inverted="" data-position="bottom center"><img src="http://s.ppy.sh/a/${player.id}" id="img_player"></div>`
                            
                            editList += `
                                <div class="item" id="item_${player.id}">
                                    <div style="height: 45px; margin-right: 0px;" data-tooltip="${player.name}" data-inverted="" data-position="top center" data-variation="mini"><img src="http://s.ppy.sh/a/${player.id}"></div>
                                    <div class="field">
                                        <input type="text" id="${counter}" name="${counter}_player" placeholder="userid" value="${player.id}" onchange="saveTeam(this.value, this.id, '${file}', '${teamname}', '${teamnameOriginal}')">
                                        <div id="remove_${player.id}" onclick="removePlayer(this.id, '${file}', '${teamname}', '${counter}')" class="ui bottom attached button buttonremplayer">
                                            <svg xmlns="http://www.w3.org/2000/svg" style="transform: scale(0.45); position: relative; top: -10.2px;" width="24" height="24" viewBox="0 0 24 24"><path d="M23.954 21.03l-9.184-9.095 9.092-9.174-2.832-2.807-9.09 9.179-9.176-9.088-2.81 2.81 9.186 9.105-9.095 9.184 2.81 2.81 9.112-9.192 9.18 9.1z"/></svg>
                                        </div>
                                    </div>
                                </div>`
                            counter++;
                        })
                        if(players.length !== 0){
                            team_player_list = `<div class="list">${playersText}</div>`
                        }
                        teamslist.insertAdjacentHTML('afterbegin', `
                            <div class="card">
                                <div class="image">
                                    <img src="/teamsimg/${image}">
                                </div>
                                <div class="content">
                                    <div class="header">${team_name}</div>
                                </div>
                                <div class="meta">
                                    <div class="team_player_list" id="team_players_${teamname}">
                                        ${team_player_list}
                                    </div>
                                    <div class="team_player_list_edit" id="team_players_edit_${teamname}">
                                        <form class="ui form" id="form_${teamname}">
                                            <div id="players_list_edit_${teamname}" class="list listeditteam">
                                                <div id="listeditteam_players_${teamname}" class="listeditteam_players">
                                                    ${editList}
                                                </div>
                                                <div class="list_buttons">
                                                    <div id="${teamname}" onclick="addPlayer(this.id, ${counter}, '${file}')" class="ui bottom attached button buttoneditlist add">
                                                    Add
                                                    </div>
                                                    <div id="${teamname}" onclick="closeTeam(this.id)" class="ui bottom attached button buttoneditlist cancel">
                                                        Close
                                                    </div>
                                                </div>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                                <div class="ui two bottom attached buttons" name="bt_${teamname}">
                                    <div id="${teamname}" name="e_${teamname}" onclick="exportTeam(this.id)" class="ui bottom attached button" data-tooltip="Export" data-inverted="" data-position="bottom center" data-variation="mini">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"><path d="M21 13v10h-21v-19h12v2h-10v15h17v-8h2zm3-12h-10.988l4.035 4-6.977 7.07 2.828 2.828 6.977-7.07 4.125 4.172v-11z"/></svg>
                                    </div>
                                    <div id="${teamname}" name="b_${teamname}" onclick="editTeam(this.id)" class="ui bottom attached button" data-tooltip="Edit" data-inverted="" data-position="bottom center" data-variation="mini">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"><path d="M18 14.45v6.55h-16v-12h6.743l1.978-2h-10.721v16h20v-10.573l-2 2.023zm1.473-10.615l1.707 1.707-9.281 9.378-2.23.472.512-2.169 9.292-9.388zm-.008-2.835l-11.104 11.216-1.361 5.784 5.898-1.248 11.103-11.218-4.536-4.534z"/></svg>
                                    </div>
                                </div>
                            </div>
                        `)
                    })
                } else {
                        let teamnameOriginal = teamname
                        teamname = teamname.split(' ').join('_')
						let counter = 1;
						let editList = `<div class="item team">
										<div class="field">
											<input type="text" name="teamname" id="teamname_input" placeholder="Team Name" value="${teamname}" onchange="changeTeamName(this.value, '${teamname}.json', '${teamname}')">
										</div>
									</div>`
						teamslist.insertAdjacentHTML('afterbegin', `
						<div class="card">
							<div class="blurring dimmable image">
								<div class="ui dimmer">
								<div class="content">
									<div class="center">
									<button id="${teamname}" onclick="editTeam(this.id)" class="ui inverted button">Edit</button>
									</div>
								</div>
								</div>
								<img src="/teamsimg/${image}">
							</div>
							<div class="content">
								<div class="header">${teamnameOriginal}</div>
							</div>
							<div class="meta">
								<div class="team_player_list" id="team_players_${teamname}">
									${team_player_list}
								</div>
								<div class="team_player_list_edit" id="team_players_edit_${teamname}">
									<form class="ui form" id="form_${teamname}">
										<div id="players_list_edit_${teamname}" class="list listeditteam">
											<div id="listeditteam_players_${teamname}" class="listeditteam_players">
												${editList}
											</div>
											<div class="list_buttons">
												<div id="${teamname}" onclick="addPlayer(this.id, ${counter}, '${teamname}.json')" class="ui bottom attached button buttoneditlist add">
													Add
												</div>
												<div id="${teamname}" onclick="closeTeam(this.id)" class="ui bottom attached button buttoneditlist cancel">
													Close
												</div>
											</div>
										</div>
									</form>
								</div>
							</div>
							<div class="ui two bottom attached buttons" name="bt_${teamname}">
								<div id="${teamname}" name="e_${teamname}" onclick="exportTeam(this.id)" class="ui bottom attached button">
									<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"><path d="M21 13v10h-21v-19h12v2h-10v15h17v-8h2zm3-12h-10.988l4.035 4-6.977 7.07 2.828 2.828 6.977-7.07 4.125 4.172v-11z"/></svg>
								</div>
								<div id="${teamname}" name="b_${teamname}" onclick="editTeam(this.id)" class="ui bottom attached button">
									<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"><path d="M18 14.45v6.55h-16v-12h6.743l1.978-2h-10.721v16h20v-10.573l-2 2.023zm1.473-10.615l1.707 1.707-9.281 9.378-2.23.472.512-2.169 9.292-9.388zm-.008-2.835l-11.104 11.216-1.361 5.784 5.898-1.248 11.103-11.218-4.536-4.534z"/></svg>
								</div>
							</div>
						</div>
					`);
                }
           })
       }
   }) 
})
