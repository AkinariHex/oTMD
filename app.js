const team1Element = document.querySelector('#team1');
const team2Element = document.querySelector('#team2');
const team1img = document.querySelector('.teaminner1');
const team2img = document.querySelector('.teaminner2');
const textzone = document.querySelector('#score');

const getSettings = async () => {
  try {
    let res = await fetch('/settings')
    res = await res.json()
    return res
  } catch (err) {
    clearInterval(interval);
    console.error(err);
  }

  // let a = null
  // fetch('/settings')
  //   .then(response => response.json())
  //   .then(data => {
  //     return data
  //   })
  //   .catch(err => {
  //     console.error(err)
  //   })
}


getSettings().then((settingsdata) => {
  var osuapi = settingsdata.apikey;
  var matchid = settingsdata.matchid;
  var warmups = settingsdata.warmups;
  var reverse = settingsdata.reverse;
  var bestof = settingsdata.bestof;
  if(osuapi != 'null' && matchid != 'null' && warmups != 'null' && reverse != 'null' && bestof != 'null'){
    matchdata(osuapi, matchid, warmups, osuinterval, reverse, bestof);
    var osuinterval = setInterval(function(){matchdata(osuapi, matchid, warmups, osuinterval, reverse, bestof)}, 20000);
  }
})


const countries = 
[   
    {
        'country': 'Italy',
        'id': 'IT'
    },
    {
        'country': 'Canada',
        'id': 'CA'
    },
    {
        'country': 'China',
        'id': 'CN'
    },
    {
        'country': 'United States',
        'id': 'US'
    },
    {
        'country': 'Germany',
        'id': 'DE'
    },
    {
        'country': 'Indonesia',
        'id': 'ID'
    },
    {
        'country': 'Russia',
        'id': 'RU'
    }
]

function matchdata(api, mpid, warmups, interval, reverse, bestof) {
  var team1score = 0;
  var team2score = 0;
  var team1 = 0;
  var team2 = 0;
  axios.get(`https://osu.ppy.sh/api/get_match?k=${api}&mp=${mpid}`).then(data => {
    console.log(data.data)
    for(var i=warmups; i<data.data.games.length; i++){
        for(var x=0; x<data.data.games[i].scores.length; x++){
          var gameended = data.data.games[i].end_time==null;
          if(gameended == false ){
            if(data.data.games[i].scores[x].team == '1'){
              team1score+=parseInt(data.data.games[i].scores[x].score);
            } else if(data.data.games[i].scores[x].team == '2'){
                team2score+=parseInt(data.data.games[i].scores[x].score);
            }
            
          } else {
            return;
          }
        }
      if(team1score - team2score == 0){
        return;
      } else if(team1score - team2score > 0){
          team1++;
          team1score = 0;
          team2score = 0;
      } else {
          team2++;
          team1score = 0;
          team2score = 0;
      }
    }
    var patt = /\((.*?)\)/g;
    var teamnames = data.data.match.name.match(patt);
    console.log(`${teamnames[0]} ${team1} - ${team2} ${teamnames[1]}`);
    
    var team1name = teamnames[0].replace(/([()])/g, "");
    var team2name = teamnames[1].replace(/([()])/g, "");
    var team1pos = null;
    var team2pos = null;
    var team1imgstring = '';
    var team2imgstring = '';

    // CHECK FOR COUNTRIES FLAGS
    for(var z=0; z<countries.length; z++){
      if(team1name.includes(countries[z].country)){
          team1pos = z;
          team1imgstring = `<img class="countryimg" src="https://osu.ppy.sh/images/flags/${countries[team1pos].id}.png"> <br />`;
        }
      if(team2name.includes(countries[z].country)){
          team2pos = z;
          team2imgstring = `<img class="countryimg" src="https://osu.ppy.sh/images/flags/${countries[team2pos].id}.png"> <br />`;
      }
    }

    

    if(team1pos != null){
      team1img.innerHTML = `${team1imgstring} ${team1name}`;
    } else {
      team1img.innerHTML = `${team1name}`;
    }
    
    if(team2pos != null){
      team2img.innerHTML = `${team2imgstring} ${team2name}`;
    } else {
      team2img.innerHTML = `${team2name}`;
    }

    if(reverse == 'true' || reverse == true){
      team1Element.textContent = team2;
      team2Element.textContent = team1;
      if(team1 || team2 == (bestof/2)+0.5){
        clearInterval(interval);
        team1img.innerHTML = '';
        team2img.innerHTML = '';
        if(team1 == (bestof/2)+0.5){
          textzone.innerHTML = `<span style="color: #93ff93; font-size: 16px">${team2imgstring} ${team2name} wins!</span>`;
        } else {
          textzone.innerHTML = `<span style="color: #93ff93; font-size: 16px">${team1imgstring} ${team1name} wins!</span>`;
        }
      } /*else {
        if(team1 || team2 == (bestof/2)+0.5){
          clearInterval(interval);
          team1img.innerHTML = '';
          team2img.innerHTML = '';
          if(team1 == (bestof/2)+0.5){
            textzone.innerHTML = `<span style="color: #93ff93; font-size: 16px">${team1imgstring} ${team1name} wins!</span>`;
          } else {
            textzone.innerHTML = `<span style="color: #93ff93; font-size: 16px">${team2imgstring} ${team2name} wins!</span>`;
          }
        }
      }*/
    } else {
      team1Element.textContent = team1;
      team2Element.textContent = team2;
      if(team1 || team2 == (bestof/2)+0.5){
        clearInterval(interval);
        team1img.innerHTML = '';
        team2img.innerHTML = '';
        if(team1 == (bestof/2)+0.5){
          textzone.innerHTML = `<span style="color: #93ff93; font-size: 16px">${team1imgstring} ${team1name} wins!</span>`;
        } else {
          textzone.innerHTML = `<span style="color: #93ff93; font-size: 16px">${team2imgstring} ${team2name} wins!</span>`;
        }
      } /*else {
        if(team1 || team2 == (bestof/2)+0.5){
          clearInterval(interval);
          team1img.innerHTML = '';
          team2img.innerHTML = '';
          if(team1 == (bestof/2)+0.5){
            textzone.innerHTML = `<span style="color: #93ff93; font-size: 16px">${team1imgstring} ${team1name} wins!</span>`;
          } else {
            textzone.innerHTML = `<span style="color: #93ff93; font-size: 16px">${team2imgstring} ${team2name} wins!</span>`;
          }
        }
      }*/
    }

    

    team1 = 0;
    team2 = 0;

    console.log('fine');

  }).catch(err => {
    clearInterval(interval);
    console.log(err);
    console.log('API errata');
    textzone.innerHTML = '<span style="color: #e45a5a; font-size: 15px">ERROR, CHECK IF APIKEY, MATCHID, WARMUPS, REVERSE AND BESTOF ARE CORRECT</span>';
  })
}



