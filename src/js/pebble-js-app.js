var SERVICE_OPEN_WEATHER  = "open";
var SERVICE_YAHOO_WEATHER = "yahoo";
var EXTERNAL_DEBUG_URL    = '';
var CONFIGURATION_URL     = 'http://jaredbiehler.github.io/weather-my-way/config/';

var externalDebugEnabled = false;  // POST logs to external server - dangerous! lat lon recorded
var debugEnabled         = true;   // Display debug info on watch
var batteryEnabled       = true;   // Display battery info on watch
var weatherService       = SERVICE_YAHOO_WEATHER;
var weatherScale         = 'F';

// Allow console messages to be turned on / off 
(function(){
    var original = console.log;
    var logMessage = function (message) {
        if (debugEnabled) {
          original.apply(console, arguments);
        }  
    };
    console.log  = logMessage;
    console.warn = logMessage;
})();


function ack()  {console.log("Pebble ACK sendAppMessage");}
function nack() {console.warn("Pebble NACK sendAppMessage");}

// Setup Pebble Event Listeners
Pebble.addEventListener("ready", function(e) {
    console.log("Starting ...");
    Pebble.sendAppMessage({ "js_ready": true }, ack, nack);
});

Pebble.addEventListener("appmessage", function(data) {
    console.log("Got a message - Starting weather request ... " + JSON.stringify(data));
    try {
      weatherService = data.payload.service;
      debugEnabled   = data.payload.debug   === 1;
      batteryEnabled = data.payload.battery === 1;
      weatherScale   = data.payload.scale;
    } catch (e) {
      console.warn("Could not retrieve data sent from Pebble: "+e.message);
    }
    updateWeather();
});

Pebble.addEventListener("showConfiguration", function (e) {
    console.log('Configuration requested');
    var queryString = '?s='+weatherService+'&d='+debugEnabled+'&u='+weatherScale+'&b='+(batteryEnabled?'on':'off');
    Pebble.openURL(CONFIGURATION_URL+queryString);
});

Pebble.addEventListener("webviewclosed", function(e) {
    if (e.response) {
      try {
        var settings = JSON.parse(decodeURIComponent(e.response));

        weatherService = settings.service === SERVICE_YAHOO_WEATHER ? SERVICE_YAHOO_WEATHER : SERVICE_OPEN_WEATHER
        weatherScale   = settings.scale   === 'F' ? 'F' : 'C';
        debugEnabled   = settings.debug   === 'true';
        batteryEnabled = settings.battery === 'on';

        console.log("Settings received: "+JSON.stringify(settings));
        updateWeather();
      } catch(e) {
        console.warn("Unable to parse response from configuration:"+e.message);
      }
    }
});

function updateWeather() {
  var locationOptions = { "timeout": 15000, "maximumAge": 60000 };
  navigator.geolocation.getCurrentPosition(locationSuccess, locationError, locationOptions);
}

function locationSuccess(pos) {
    var coordinates = pos.coords;
    console.log("Got coordinates: " + JSON.stringify(coordinates));
    if (weatherService === SERVICE_YAHOO_WEATHER) {
      fetchYahooWeather(coordinates.latitude, coordinates.longitude);
    } else {
      fetchOpenWeather(coordinates.latitude, coordinates.longitude);
    }
}

function locationError(err) {
    var message = 'Location error (' + err.code + '): ' + err.message;
    console.warn(message);
    Pebble.sendAppMessage({ "error": "Loc unavailable" }, ack, nack);
    postDebugMessage({"error": message});
}

var fetchYahooWeather = function(latitude, longitude) {

  var subselect, neighbor, query, multi
    , options = {};

  subselect   = 'SELECT woeid FROM geo.placefinder WHERE text="'+latitude+','+longitude+'" AND gflags="R"';
  neighbor    = 'SELECT neighborhood FROM geo.placefinder WHERE text="'+latitude+','+longitude+'" AND gflags="R";';
  query       = 'SELECT * FROM weather.forecast WHERE woeid IN ('+subselect+') AND u="'+weatherScale.toLowerCase()+'";';
  multi       = "SELECT * FROM yql.query.multi WHERE queries='"+query+" "+neighbor+"'";
  options.url = "https://query.yahooapis.com/v1/public/yql?format=json&q=" + encodeURIComponent(multi);

  options.parse = function(response) {
      var sunrise, sunset, pubdate, neighborhood;
      sunrise = response.query.results.results[0].channel.astronomy.sunrise;
      sunset  = response.query.results.results[0].channel.astronomy.sunset;
      pubdate = new Date(Date.parse(response.query.results.results[0].channel.item.pubDate));
      neighborhood = ''+response.query.results.results[1].Result.neighborhood;

      return {
        'condition':   parseInt(response.query.results.results[0].channel.item.condition.code),
        'temperature': parseInt(response.query.results.results[0].channel.item.condition.temp),
        'sunrise':     Date.parse(new Date().toDateString()+" "+sunrise) / 1000,
        'sunset':      Date.parse(new Date().toDateString()+" "+sunset) / 1000,
        'locale':      neighborhood,
        'pubdate':     pubdate.getHours()+':'+pubdate.getMinutes(),
        'tzoffset':    new Date().getTimezoneOffset() * 60,
        'service':     weatherService,
        'scale':       weatherScale,
        'debug':       debugEnabled,
        'battery':     batteryEnabled
      };
  };

  fetchWeather(options); 
};

var fetchOpenWeather = function(latitude, longitude) {

  var options = {};
  options.url = "http://api.openweathermap.org/data/2.5/weather?lat=" + latitude + "&lon=" + longitude + "&cnt=1";

  options.parse = function(response) {
      var temperature, sunrise, sunset, condition, pubdate;

      var tempResult = response.main.temp;
      if (weatherScale === 'F') {
        // Convert temperature to Fahrenheit 
        temperature = Math.round(((tempResult - 273.15) * 1.8) + 32);
      }
      else {
        // Otherwise, convert temperature to Celsius
        temperature = Math.round(tempResult - 273.15);
      }

      condition = response.weather[0].id;
      sunrise   = response.sys.sunrise;
      sunset    = response.sys.sunset;
      pubdate   = new Date(response.dt*1000); 

      return {
        'condition':   condition,
        'temperature': temperature, 
        'sunrise':     sunrise,
        'sunset':      sunset,
        'locale':      response.name,
        'pubdate':     pubdate.getHours()+':'+pubdate.getMinutes(),
        'tzoffset':    new Date().getTimezoneOffset() * 60,
        'service':     weatherService,
        'scale':       weatherScale,
        'debug':       debugEnabled,
        'battery':     batteryEnabled
      };
  };
  fetchWeather(options);
};

var fetchWeather = function(options) {

  //console.log('URL: ' + options.url);

  getJson(options.url, function(err, response) {

    try {
      if (err) {
        throw err;
      }

      var weather = options.parse(response);

      console.log('Weather Data: ' + JSON.stringify(weather));

      Pebble.sendAppMessage(weather, ack, nack);
      postDebugMessage(weather);
    
    } catch (e) {
      console.warn("Could not find weather data in response: " + e.message);
      var error = { "error": "HTTP Error" };
      Pebble.sendAppMessage(error, ack, nack);
      postDebugMessage(error);
    }
  });
};

var getJson = function(url, callback) {
  try {
    var req = new XMLHttpRequest();
    req.open('GET', url, true);
    req.onload = function(e) {
      if (req.readyState == 4) {
        if(req.status == 200) {
          try {
            //console.log(req.responseText);
            var response = JSON.parse(req.responseText);
            callback(null, response);
          } catch (e) {
            callback(e.message);
          }
        } else {
          callback("Error request status not 200, status: "+req.status);
        }
      }
    };
    req.send(null);
  } catch(e) {
    callback("Unable to GET JSON: "+e.message);
  }
};

var postDebugMessage = function (data) {
  if (!externalDebugEnabled || EXTERNAL_DEBUG_URL === null) {
    return;
  }
  try {
    if (typeof data.sr !== "undefined") {
      delete data.sr;
      delete data.ss;
    }
    post(EXTERNAL_DEBUG_URL, 'data='+JSON.stringify(data));
  } catch (e) {
    console.warn('Post Debug Message failed:'+e.message);
  }  
};

var post = function(url, data) {
  try {
    var req = new XMLHttpRequest();
    req.open('POST', url, true);
    req.send(data);
  } catch(e) {
    console.warn('POST failed: ' + e.message);
  }
};