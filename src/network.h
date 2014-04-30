#include <pebble.h>

#define KEY_TEMPERATURE 0
#define KEY_CONDITION 1
#define KEY_SUNRISE 2
#define KEY_SUNSET 3
#define KEY_PUB_DATE 4
#define KEY_ERROR 5
#define KEY_SERVICE 6
#define KEY_LOCALE 7
#define KEY_DEBUG 8
#define KEY_JS_READY 9
#define KEY_SCALE 10
#define KEY_BATTERY 11
#define KEY_TZOFFSET 12

#define SERVICE_OPEN_WEATHER "open"
#define SERVICE_YAHOO_WEATHER "yahoo"

typedef enum {
  WEATHER_E_OK = 0,
  WEATHER_E_DISCONNECTED,
  WEATHER_E_PHONE,
  WEATHER_E_NETWORK
} WeatherError;

typedef struct {
  int temperature;
  int condition;
  int sunrise;
  int sunset;
  char* pub_date;
  char* service;
  char* locale;
  char* scale;
  bool debug;
  bool js_ready;
  bool battery; 
  int tzoffset;
  time_t updated;
  WeatherError error;
} WeatherData;

void init_network(WeatherData *weather_data);
void close_network();
void request_weather();