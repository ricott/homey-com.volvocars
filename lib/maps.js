'use strict';

const http = require('http.min');

const osmEndpoint = 'nominatim.openstreetmap.org';
const osmCommand = '/reverse';
const osmUserAgent = 'Homey Volvo On Call App - https://github.com/ricott/com.volvocars';
const defaultLanguage = 'en';

exports.geocodeLatLng = function (lat, lon, language) {
  if (!language) language = defaultLanguage;
  var options = {
    protocol: 'https:',
    hostname: osmEndpoint,
    path: osmCommand,
    query: {format: 'json', lat: lat, lon: lon},
    headers: {
      'User-Agent': osmUserAgent, 'Accept-Language': language.toLowerCase()
    }
  }
  return http.json(options).then(function (result) {
    if (result.error || !result.address) {
      return ({place: 'Unknown', city: 'Unknown'});
    }
    return {
      place: result.address.cycleway || result.address.road || result.address.retail || result.address.footway || result.address.address29 || result.address.path || result.address.pedestrian || result.address[Object.keys(result.address)[0]],
      city: result.address.city || result.address.town || result.address.village || result.address[Object.keys(result.address)[1]]
    }
  });
}

exports.calculateDistance = function (lat1, lon1, lat2, lon2, unit) {
  // based on https://www.geodatasource.com/developers/javascript
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0
  unit = (unit || 'M').toUpperCase()
  var radlat1 = Math.PI * lat1 / 180
  var radlat2 = Math.PI * lat2 / 180
  var theta = lon1 - lon2
  var radtheta = Math.PI * theta / 180
  var dist = Math.sin(radlat1) * Math.sin(radlat2) + Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta)
  dist = Math.acos(dist)
  dist = dist * 180 / Math.PI
  dist = dist * 60 * 1.1515 // result in Miles per default
  if (unit === 'K') { dist = dist * 1.609344 }
  if (unit === 'M') { dist = dist * 1.609344 * 1000 }
  if (unit === 'N') { dist = dist * 0.8684 }
  return dist
}
