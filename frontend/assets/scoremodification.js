function modsModifiers(mods, score, modifier){
	const modlist = [
	  {mod: "NF", pos: 31},
	  {mod: "EZ", pos: 30},
	  {mod: "TD", pos: 29},
	  {mod: "HD", pos: 28},
	  {mod: "HR", pos: 27},
	  {mod: "SD", pos: 26},
	  {mod: "DT", pos: 25},
	  {mod: "RX", pos: 24},
	  {mod: "HT", pos: 23},
	  {mod: "NC", pos: 22},
	  {mod: "FL", pos: 21},
	  {mod: "AU", pos: 20},
	  {mod: "SO", pos: 19},
	  {mod: "AP", pos: 18},
	  {mod: "PF", pos: 17},
	  {mod: "4K", pos: 16},
	  {mod: "5K", pos: 15},
	  {mod: "6K", pos: 14},
	  {mod: "7K", pos: 13},
	  {mod: "8K", pos: 12},
	  {mod: "FI", pos: 11},
	  {mod: "RD", pos: 10},
	  {mod: "CN", pos: 9},
	  {mod: "TG", pos: 8},
	  {mod: "9K", pos: 7},
	  {mod: "KC", pos: 6},
	  {mod: "1K", pos: 5},
	  {mod: "3K", pos: 4},
	  {mod: "2K", pos: 3},
	  {mod: "V2", pos: 2},
	  {mod: "MR", pos: 1}
	]
  
	let modarr = []
	let mod = parseInt(mods);
  
	if (isNaN(mods) == false) {
	  let bit = mod.toString(2)
	  let fullbit = "0000000000000000000000000000000".substr(bit.length) + bit 
	  if(mod == 0){
		modarr.push('NM');
	  } else {
		for (var i = 31; i >= 0; i--) {
			if (fullbit[i] == 1) {
				modarr.push(modlist.find(m => m.pos == i+1).mod)
				
			}
		}
	  }
	}
  
  
	let scoremod = score;

	if(modarr.includes('NM') == true){
		if(modifier.NM.type == '*'){
			scoremod = score * parseFloat(modifier.NM.value);
		} else if (modifier.NM.type == '/'){
			scoremod = score / parseFloat(modifier.NM.value);
		}
		//scoremod = score * parseFloat(modifier.FL);
	}
	if(modarr.includes('HR') == true){
		if(modifier.HR.type == '*'){
			scoremod = score * parseFloat(modifier.HR.value);
		} else if (modifier.HR.type == '/'){
			scoremod = score / parseFloat(modifier.HR.value);
		}
		//scoremod = score * parseFloat(modifier.FL);
	}
	if(modarr.includes('HD') == true){
		if(modifier.HD.type == '*'){
			scoremod = score * parseFloat(modifier.HD.value);
		} else if (modifier.HD.type == '/'){
			scoremod = score / parseFloat(modifier.HD.value);
		}
		//scoremod = score * parseFloat(modifier.FL);
	}
	if(modarr.includes('HDHR') == true){
		if(modifier.HDHR.type == '*'){
			scoremod = score * parseFloat(modifier.HDHR.value);
		} else if (modifier.HDHR.type == '/'){
			scoremod = score / parseFloat(modifier.HDHR.value);
		}
		//scoremod = score * parseFloat(modifier.FL);
	}
	if(modarr.includes('HDEZ') == true){
		if(modifier.HDEZ.type == '*'){
			scoremod = score * parseFloat(modifier.HDEZ.value);
		} else if (modifier.HDEZ.type == '/'){
			scoremod = score / parseFloat(modifier.HDEZ.value);
		}
		//scoremod = score * parseFloat(modifier.FL);
	}
	if(modarr.includes('EZFL') == true){
		if(modifier.EZFL.type == '*'){
			scoremod = score * parseFloat(modifier.EZFL.value);
		} else if (modifier.EZFL.type == '/'){
			scoremod = score / parseFloat(modifier.EZFL.value);
		}
		//scoremod = score * parseFloat(modifier.FL);
	}
	if(modarr.includes('EZ') == true){
		if(modifier.EZ.type == '*'){
			scoremod = score * parseFloat(modifier.EZ.value);
		} else if (modifier.EZ.type == '/'){
			scoremod = score / parseFloat(modifier.EZ.value);
		}
		//scoremod = score * parseFloat(modifier.EZ);
	}
	if(modarr.includes('FL') == true){
		if(modifier.FL.type == '*'){
			scoremod = score * parseFloat(modifier.FL.value);
		} else if (modifier.FL.type == '/'){
			scoremod = score / parseFloat(modifier.FL.value);
		}
		//scoremod = score * parseFloat(modifier.FL);
	}
  
	return scoremod;
}

function modsModifiersQualifiers(mods){
	const modlist = [
	  {mod: "NF", pos: 31, linkIMG: 'no-fail'},
	  {mod: "EZ", pos: 30, linkIMG: 'easy'},
	  {mod: "TD", pos: 29, linkIMG: 'touchdevice'},
	  {mod: "HD", pos: 28, linkIMG: 'hidden'},
	  {mod: "HR", pos: 27, linkIMG: 'hard-rock'},
	  {mod: "SD", pos: 26, linkIMG: 'sudden-death'},
	  {mod: "DT", pos: 25, linkIMG: 'double-time'},
	  {mod: "RX", pos: 24, linkIMG: 'relax'},
	  {mod: "HT", pos: 23, linkIMG: 'half'},
	  {mod: "NC", pos: 22, linkIMG: 'nightcore'},
	  {mod: "FL", pos: 21, linkIMG: 'flashlight'},
	  {mod: "AU", pos: 20, linkIMG: 'auto'},
	  {mod: "SO", pos: 19, linkIMG: 'spun-out'},
	  {mod: "AP", pos: 18, linkIMG: 'autopilot'},
	  {mod: "PF", pos: 17, linkIMG: 'perfect'},
	  {mod: "4K", pos: 16},
	  {mod: "5K", pos: 15},
	  {mod: "6K", pos: 14},
	  {mod: "7K", pos: 13},
	  {mod: "8K", pos: 12},
	  {mod: "FI", pos: 11},
	  {mod: "RD", pos: 10},
	  {mod: "CN", pos: 9},
	  {mod: "TG", pos: 8},
	  {mod: "9K", pos: 7},
	  {mod: "KC", pos: 6},
	  {mod: "1K", pos: 5},
	  {mod: "3K", pos: 4},
	  {mod: "2K", pos: 3},
	  {mod: "V2", pos: 2},
	  {mod: "MR", pos: 1}
	]
  
	var modarr = ''
	let mod = parseInt(mods);
  
	if (isNaN(mods) == false) {
	  let bit = mod.toString(2)
	  let fullbit = "0000000000000000000000000000000".substr(bit.length) + bit 
	  if(!mod == 0){
		for (var i = 31; i >= 0; i--) {
			if (fullbit[i] == 1) {
				modarr += `<object type="image/svg+xml" data="/assets/images/modsIcons/${modlist.find(m => m.pos == i+1).mod}.svg"></object>`
			}
		}
	  } else {
		modarr = '`<object type="image/svg+xml" data="/assets/images/modsIcons/NM.svg"></object>'
	  }
	} 
  
	return modarr;
}

function winnersBracketADV(stage, valueADV){
	var points = 0;
	if(stage == 'Grand Finals'){
		if(valueADV.winnersBracketADV){
			points = valueADV.winnersBracketADV;
		}
	}
	return points;
}

export { modsModifiers, modsModifiersQualifiers, winnersBracketADV };