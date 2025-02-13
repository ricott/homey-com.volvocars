'use strict';

const config = require('./const.js');
const osmUserAgent = 'Homey Volvo On Call App - https://github.com/ricott/com.volvocars';
const defaultLanguage = 'en';

exports.geocodeLatLng = async function (lat, lon, language = defaultLanguage) {

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`, {
      headers: {
        'User-Agent': osmUserAgent,
        'Accept-Language': language.toLowerCase()
      },
      signal: AbortSignal.timeout(config.apiTimeout)
    });

    if (!response.ok) {
      return { place: 'Unknown', city: 'Unknown' };
    }

    const result = await response.json();

    if (!result.address) {
      return { place: 'Unknown', city: 'Unknown' };
    }

    let street_address = result.address.road || result.address.retail || result.address.footway || result.address.address29 || result.address.path || result.address.pedestrian || result.address[Object.keys(result.address)[0]];
    if (result.address.house_number) {
      street_address = `${street_address} ${result.address.house_number}`
    }
    return {
      display_name: result.display_name,
      address: street_address,
      city: result.address.city || result.address.town || result.address.village || result.address.neighbourhood || result.address[Object.keys(result.address)[1]],
      postcode: result.address.postcode || '',
      county: result.address.county || result.address.state_district || result.address.state || '',
      country: result.address.country
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    return { place: 'Unknown', city: 'Unknown' };
  }
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
