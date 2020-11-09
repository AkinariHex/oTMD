const team1Element = document.querySelector('#team1');
const team2Element = document.querySelector('#team2');
const team1img = document.querySelector('.teaminner1');
const team2img = document.querySelector('.teaminner2');
const textzone = document.querySelector('#score');

var oldmatchid = '';

getjson();
var jsoninterval = setInterval(function(){getjson()}, 5000);

function getjson(){
  axios.get('/settings').then((settingsdata)=>{
    console.log(settingsdata.data);
  
    var osuapi = settingsdata.data.apikey;
    var matchid = settingsdata.data.matchid;
    var warmups = settingsdata.data.warmups;
    var reverse = settingsdata.data.reverse;
    var bestof = settingsdata.data.bestof;

    if(oldmatchid != matchid){
      oldmatchid = matchid;
      if(osuapi != 'null' && matchid != 'null' && warmups != 'null' && reverse != 'null' && bestof != 'null'){
        matchdata(osuapi, matchid, warmups, osuinterval, reverse, bestof);
        var osuinterval = setInterval(function(){matchdata(osuapi, matchid, warmups, osuinterval, reverse, bestof)}, 20000);
      }
    }
  })
}


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

    // CHECK IF FOUND THE FLAG AND REPLACE THE BLANK IMAGE WITH A BLANK FLAG
    if(team1imgstring == ''){
      team1imgstring = `<img class="countryimg" src="https://osu.ppy.sh/images/flags/A1.png"> <br />`;
    }
    if(team2imgstring == ''){
      team2imgstring = `<img class="countryimg" src="https://osu.ppy.sh/images/flags/A2.png"> <br />`;
    }

    team1img.innerHTML = `${team1imgstring} ${team1name}`;
    team2img.innerHTML = `${team2imgstring} ${team2name}`;

    /*if(team1pos != null){
      team1img.innerHTML = `${team1imgstring} ${team1name}`;
    } else {
      team1img.innerHTML = `${team1name}`;
    }
    
    if(team2pos != null){
      team2img.innerHTML = `${team2imgstring} ${team2name}`;
    } else {
      team2img.innerHTML = `${team2name}`;
    }*/

    if(reverse == 'true' || reverse == true){
      team1Element.textContent = team2;
      team2Element.textContent = team1;
      if(team1 == (bestof/2)+0.5 || team2 == (bestof/2)+0.5){
        clearInterval(interval);
        team1img.innerHTML = '';
        team2img.innerHTML = '';
        if(team1 == (bestof/2)+0.5){
          textzone.innerHTML = `<span style="color: #93ff93; font-size: 16px">${team2imgstring} ${team2name} wins!</span>`;
        } else {
          textzone.innerHTML = `<span style="color: #93ff93; font-size: 16px">${team1imgstring} ${team1name} wins!</span>`;
        }
      } else {
        team1Element.textContent = team2;
        team2Element.textContent = team1;
      }
    } else {
      team1Element.textContent = team1;
      team2Element.textContent = team2;
      if(team1 == (bestof/2)+0.5 || team2 == (bestof/2)+0.5){
        clearInterval(interval);
        team1img.innerHTML = '';
        team2img.innerHTML = '';
        if(team1 == (bestof/2)+0.5){
          textzone.innerHTML = `<span style="color: #93ff93; font-size: 16px">${team1imgstring} ${team1name} wins!</span>`;
        } else {
          textzone.innerHTML = `<span style="color: #93ff93; font-size: 16px">${team2imgstring} ${team2name} wins!</span>`;
        }
      } else {
        team1Element.textContent = team1;
        team2Element.textContent = team2;
      }
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



const countries = 
[   
  {
      "country": "Italy",
      "id": "IT"
  },
  {
      "country": "Canada",
      "id": "CA"
  },
  {
      "country": "China",
      "id": "CN"
  },
  {
      "country": "United States",
      "id": "US"
  },
  {
      "country": "Germany",
      "id": "DE"
  },
  {
      "country": "Indonesia",
      "id": "ID"
  },
  {
      "country": "Russia",
      "id": "RU"
  },
  {
      "country": "Andorra",
      "id": "AD"
  },
  {
      "country": "Argentina",
      "id": "AR"
  },
  {
      "country": "Australia",
      "id": "AU"
  },
  {
      "country": "Austria",
      "id": "AT"
  },
  {
      "country": "Belgium",
      "id": "BE"
  },
  {
      "country": "Brazil",
      "id": "BR"
  },
  {
      "country": "Bulgaria",
      "id": "BG"
  },
  {
      "country": "Chile",
      "id": "CL"
  },
  {
      "country": "Colombia",
      "id": "CO"
  },
  {
      "country": "Croatia",
      "id": "HR"
  },
  {
      "country": "Poland",
      "id": "PL"
  },
  {
      "country": "France",
      "id": "FR"
  },
  {
      "country": "Japan",
      "id": "JP"
  },
  {
      "country": "United Kingdom",
      "id": "GB"
  },
  {
      "country": "Taiwan",
      "id": "TW"
  },
  {
      "country": "South Korea",
      "id": "KR"
  },
  {
      "country": "Philippines",
      "id": "PH"
  },
  {
      "country": "Ukraine",
      "id": "UA"
  },
  {
      "country": "Finland",
      "id": "FI"
  },
  {
      "country": "Malaysia",
      "id": "MY"
  },
  {
      "country": "Mexico",
      "id": "MX"
  },
  {
      "country": "Singapore",
      "id": "SG"
  },
  {
      "country": "Netherlands",
      "id": "NL"
  },
  {
      "country": "Spain",
      "id": "ES"
  },
  {
      "country": "Hong Kong",
      "id": "HK"
  },
  {
      "country": "Sweden",
      "id": "SE"
  },
  {
      "country": "Thailand",
      "id": "TH"
  },
  {
      "country": "Vietnam",
      "id": "VN"
  },
  {
      "country": "Czech Republic",
      "id": "CZ"
  },
  {
      "country": "Norway",
      "id": "NO"
  },
  {
      "country": "Turkey",
      "id": "TR"
  },
  {
      "country": "Belarus",
      "id": "BY"
  },
  {
      "country": "Portugal",
      "id": "PT"
  },
  {
      "country": "Romania",
      "id": "RO"
  },
  {
      "country": "Hungary",
      "id": "HU"
  },
  {
      "country": "Kazakhstan",
      "id": "KZ"
  },
  {
      "country": "Peru",
      "id": "PE"
  },
  {
      "country": "Denmark",
      "id": "DK"
  },
  {
      "country": "Lithuania",
      "id": "LT"
  },
  {
      "country": "New Zealand",
      "id": "NZ"
  },
  {
      "country": "Israel",
      "id": "IL"
  },
  {
      "country": "Switzerland",
      "id": "CH"
  },
  {
      "country": "Estonia",
      "id": "EE"
  },
  {
      "country": "Greece",
      "id": "GR"
  },
  {
      "country": "Slovakia",
      "id": "SK"
  }
]
