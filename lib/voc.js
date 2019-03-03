'use strict';

var http = require('http.min');
var EventEmitter = require('events');
var util = require('util');

const apiProtocol = 'https:';
const apiDomains = {
  eu: 'vocapi.wirelesscar.net',
  na: 'vocapi-na.wirelesscar.net',
  cn: 'vocapi-cn.wirelesscar.net'
};
const apiEndpoint = '/customerapi/rest/v3.0/';

function VOC (options) {
  var self = this;
  EventEmitter.call(self);
  if (options == null) { options = {} };
  self.username = options.username;
  self.password = options.password;
  self.region = options.region;
  //Used for service invocations to check for result of invocation
  self._serviceInvocationSuccess = false;
}
util.inherits(VOC, EventEmitter)

VOC.prototype.getVehicleAttributes = function (vehicleId) {
  var self = this;
  return getVehicleAttributes(self.username, self.password, self.region, [vehicleId])
    .then(function (vehicles) {
      self.emit('car_attributes_update', vehicles[0]);
      return vehicles[0];
    })
    .catch(reason => {
      self.emit('voc_api_error', reason);
      return Promise.reject(reason);
    });
}

VOC.prototype.refreshVehicleStatus = function (vehicleId) {
  var self = this;
  return refreshVehicleStatus(self.username, self.password, self.region, vehicleId)
    .then(function (status) {
      return awaitSuccessfulServiceInvocation(self, vehicleId, status.customerServiceId)
        .then(function (result) {
          self.emit('car_refreshed_status', result);
          return result;
        })
    })
    .catch(reason => {
      self.emit('voc_api_error', reason);
      return Promise.reject(reason);
    });
}

VOC.prototype.startHeater = function (vehicleId) {
  var self = this;
  return startHeater(self.username, self.password, self.region, vehicleId)
    .then(function (status) {
      return awaitSuccessfulServiceInvocation(self, vehicleId, status.customerServiceId)
        .then(function (result) {
          self.emit('car_action_status', {action: 'startHeater', result: result});
          return result;
        })
    })
    .catch(reason => {
      self.emit('voc_api_error', reason);
      return Promise.reject(reason);
    });
}

VOC.prototype.stopHeater = function (vehicleId) {
  var self = this;
  return stopHeater(self.username, self.password, self.region, vehicleId)
    .then(function (status) {
      return awaitSuccessfulServiceInvocation(self, vehicleId, status.customerServiceId)
        .then(function (result) {
          self.emit('car_action_status', {action: 'stopHeater', result: result});
          return result;
        })
    })
    .catch(reason => {
      self.emit('voc_api_error', reason);
      return Promise.reject(reason);
    });
}

VOC.prototype.lock = function (vehicleId) {
  var self = this;
  return lock(self.username, self.password, self.region, vehicleId)
    .then(function (status) {
      return awaitSuccessfulServiceInvocation(self, vehicleId, status.customerServiceId)
        .then(function (result) {
          self.emit('car_action_status', {action: 'lock', result: result});
          return result;
        })
    })
    .catch(reason => {
      self.emit('voc_api_error', reason);
      return Promise.reject(reason);
    });
}

VOC.prototype.unlock = function (vehicleId) {
  var self = this;
  return unlock(self.username, self.password, self.region, vehicleId)
    .then(function (status) {
      return awaitSuccessfulServiceInvocation(self, vehicleId, status.customerServiceId)
        .then(function (result) {
          self.emit('car_action_status', {action: 'unlock', result: result});
          return result;
        })
    })
    .catch(reason => {
      self.emit('voc_api_error', reason);
      return Promise.reject(reason);
    });
}

VOC.prototype.startEngine = function (vehicleId, duration) {
  var self = this;
  return startEngine(self.username, self.password, self.region, vehicleId, duration)
    .then(function (status) {
      return awaitSuccessfulServiceInvocation(self, vehicleId, status.customerServiceId)
        .then(function (result) {
          self.emit('car_action_status', {action: 'startEngine', result: result});
          return result;
        })
    })
    .catch(reason => {
      self.emit('voc_api_error', reason);
      return Promise.reject(reason);
    });
}

VOC.prototype.stopEngine = function (vehicleId) {
  var self = this;
  return stopEngine(self.username, self.password, self.region, vehicleId)
    .then(function (status) {
      return awaitSuccessfulServiceInvocation(self, vehicleId, status.customerServiceId)
        .then(function (result) {
          self.emit('car_action_status', {action: 'stopEngine', result: result});
          return result;
        })
    })
    .catch(reason => {
      self.emit('voc_api_error', reason);
      return Promise.reject(reason);
    });
}

VOC.prototype.blinkLights = function (vehicleId, latitude, longitude) {
  var self = this;
  return blinkLights(self.username, self.password, self.region, vehicleId, latitude, longitude)
    .then(function (status) {
      return awaitSuccessfulServiceInvocation(self, vehicleId, status.customerServiceId)
        .then(function (result) {
          self.emit('car_action_status', {action: 'blinkLights', result: result});
          return result;
        })
    })
    .catch(reason => {
      self.emit('voc_api_error', reason);
      return Promise.reject(reason);
    });
}
VOC.prototype.honkHorn = function (vehicleId, latitude, longitude) {
  var self = this;
  return honkHorn(self.username, self.password, self.region, vehicleId, latitude, longitude)
    .then(function (status) {
      return awaitSuccessfulServiceInvocation(self, vehicleId, status.customerServiceId)
        .then(function (result) {
          self.emit('car_action_status', {action: 'honkHorn', result: result});
          return result;
        })
    })
    .catch(reason => {
      self.emit('voc_api_error', reason);
      return Promise.reject(reason);
    });
}
VOC.prototype.honkHornAndBlinkLights = function (vehicleId, latitude, longitude) {
  var self = this;
  return honkHornAndBlinkLights(self.username, self.password, self.region, vehicleId, latitude, longitude)
    .then(function (status) {
      return awaitSuccessfulServiceInvocation(self, vehicleId, status.customerServiceId)
        .then(function (result) {
          self.emit('car_action_status', {action: 'honkHornAndBlinkLights', result: result});
          return result;
        })
    })
    .catch(reason => {
      self.emit('voc_api_error', reason);
      return Promise.reject(reason);
    });
}


VOC.prototype.getVehicleStatus = function (vehicleId) {
  var self = this;
  return getVehicleStatus(self.username, self.password, self.region, vehicleId)
    .then(function (vehicle) {
      self.emit('car_status_update', vehicle);
      return vehicle;
    })
    .catch(reason => {
      self.emit('voc_api_error', reason);
      return Promise.reject(reason);
    });
}

VOC.prototype.getVehiclePosition = function (vehicleId) {
  var self = this;
  return getVehiclePosition(self.username, self.password, self.region, vehicleId)
    .then(function (position) {
      self.emit('car_position_update', position);
      return position;
    })
    .catch(reason => {
      self.emit('voc_api_error', reason);
      return Promise.reject(reason);
    });
}

VOC.prototype.listVehiclesOnAccount = function () {
  var self = this;
  return getRelationLinks(self.username, self.password, self.region)
    //.then(getVehicleIds)
    .then(function (relationLinks) {
      return getVehicleIds(self.username, self.password, self.region, relationLinks);
    })
    //.then(getVehicleAttributes)
    .then(function (vehicleIds) {
      return getVehicleAttributes(self.username, self.password, self.region, vehicleIds);
    })
    .then(function (vehicles) {
      let devices = [];
      vehicles.forEach(vehicle => {
        let registrationNumber = '';
        if (vehicle.registrationNumber) {
          registrationNumber = ` / ${vehicle.registrationNumber}`;
        }
        devices.push({
          name: `${vehicle.vehicleType} / ${vehicle.modelYear}${registrationNumber}`,
          data: {
            id: vehicle.vin,
            ice: true,
            vehicleType: vehicle.vehicleType
          }
        });
      });

      self.emit('account_devices_found', devices);
      return devices;
    })
    .catch(reason => {
      self.emit('voc_api_error', reason);
      return Promise.reject(reason);
    });
}

const timeoutPromise = (timeout) => new Promise((resolve) => setTimeout(resolve, timeout));
const runFor = async (func, interval, self) => {
  let done = false;
  let counter = 0;
  while (!done && counter < 15) {
    counter++;
    await timeoutPromise(interval);
    await func()
      .then(function (response) {
        //console.log('Response:', response);
        if (response === 'Successful') {
          done = true;
          self._serviceInvocationSuccess = true;
        } else if (response === 'Failed'){
          console.error('Service invocation failed!');
          done = true;
        }
      })
      .catch(reason => {
        return Promise.reject(reason);
      });
  }

  if (counter > 15) {
    console.error(`Service invocation didn't get a status back in '${counter}' attempts!`);
  }

};

function awaitSuccessfulServiceInvocation(self, vehicleId, serviceId) {
  if (!serviceId) return Promise.reject(new Error('ServiceId is null!'));

  return runFor(() => getServiceInvocationStatus(self.username, self.password, self.region, vehicleId, serviceId), 1000, self)
    .then(function (response) {
      let result = self._serviceInvocationSuccess;
      self._serviceInvocationSuccess = false;
      return result;
    })
    .catch(reason => {
      return Promise.reject(reason);
    });
}

function getServiceInvocationStatus(user, pwd, region, vehicleId, serviceId) {
  return getVOCCommand(user, pwd, region, `vehicles/${vehicleId}/services/${serviceId}`)
    .then(function (data) {
      if (!data) return Promise.reject(new Error('getServiceInvocationStatus, api_error'));
      console.log('Service invocation status: ', data.status);
      //return (data.status === 'Successful');
      return data.status;
  });
}

function startHeater(user, pwd, region, vehicleId) {
  return postVOCCommand(user, pwd, region, `vehicles/${vehicleId}/heater/start`, null)
    .then(function (data) {
      if (!data) return Promise.reject(new Error('startHeater, api_error'));
      return data;
  });
}
function stopHeater(user, pwd, region, vehicleId) {
  return postVOCCommand(user, pwd, region, `vehicles/${vehicleId}/heater/stop`, null)
    .then(function (data) {
      if (!data) return Promise.reject(new Error('stopHeater, api_error'));
      return data;
  });
}
function lock(user, pwd, region, vehicleId) {
  return postVOCCommand(user, pwd, region, `vehicles/${vehicleId}/lock`, null)
    .then(function (data) {
      if (!data) return Promise.reject(new Error('lock, api_error'));
      return data;
  });
}
function unlock(user, pwd, region, vehicleId) {
  return postVOCCommand(user, pwd, region, `vehicles/${vehicleId}/unlock`, null)
    .then(function (data) {
      if (!data) return Promise.reject(new Error('unlock, api_error'));
      return data;
  });
}

function startEngine(user, pwd, region, vehicleId, duration) {
  return postVOCCommand(user, pwd, region, `vehicles/${vehicleId}/engine/start`, {runtime: duration})
    .then(function (data) {
      if (!data) return Promise.reject(new Error('stopEngine, api_error'));
      return data;
  });
}

function stopEngine(user, pwd, region, vehicleId) {
  return postVOCCommand(user, pwd, region, `vehicles/${vehicleId}/engine/stop`, null)
    .then(function (data) {
      if (!data) return Promise.reject(new Error('stopEngine, api_error'));
      return data;
  });
}

function blinkLights(user, pwd, region, vehicleId, latitude, longitude) {
  return postVOCCommandwithPosition(user, pwd, region,
                                  `vehicles/${vehicleId}/honk_blink/lights`,
                                  latitude, longitude)
    .then(function (data) {
      if (!data) return Promise.reject(new Error('blinkLights, api_error'));
      return data;
  });
}
function honkHorn(user, pwd, region, vehicleId, latitude, longitude) {
  return postVOCCommandwithPosition(user, pwd, region,
                                  `vehicles/${vehicleId}/honk_blink/horn`,
                                  latitude, longitude)
    .then(function (data) {
      if (!data) return Promise.reject(new Error('honkHorn, api_error'));
      return data;
  });
}
function honkHornAndBlinkLights(user, pwd, region, vehicleId, latitude, longitude) {
  return postVOCCommandwithPosition(user, pwd, region,
                                  `vehicles/${vehicleId}/honk_blink/both`,
                                  latitude, longitude)
    .then(function (data) {
      if (!data) return Promise.reject(new Error('honkAndBlinkLights, api_error'));
      return data;
  });
}



function refreshVehicleStatus(user, pwd, region, vehicleId) {
  return postVOCCommand(user, pwd, region, `vehicles/${vehicleId}/updatestatus`, null)
    .then(function (data) {
      if (!data) return Promise.reject(new Error('refreshVehicleStatus, api_error'));
      return data;
  });
}

function getVehicleStatus(user, pwd, region, vehicleId) {
  return getVOCCommand(user, pwd, region, `vehicles/${vehicleId}/status`)
    .then(function (data) {
      if (!data) return Promise.reject(new Error('getVehicleStatus, api_error'));
      return data;
  });
}

function getVehiclePosition(user, pwd, region, vehicleId) {
  return getVOCCommand(user, pwd, region, `vehicles/${vehicleId}/position`)
    .then(function (data) {
      if (!data) return Promise.reject(new Error('getVehiclePosition, api_error'));
      return data.position;
  });
}

function getRelationLinks(user, pwd, region) {
  let relationLinks = [];
  return getVOCCommand(user, pwd, region, 'customeraccounts')
    .then(function (data) {
      if (!data) return Promise.reject(new Error('getRelationLinks, api_error'));

      data.accountVehicleRelations.forEach(link => {
        let command = link.substring(link.indexOf('/vehicle-account-relations'));
        relationLinks.push(command);
      });
      return relationLinks;
  });
}

async function getVehicleIds(user, pwd, region, relationLinks) {
  let finalArray = relationLinks.map(async(command) => {
      const result = await getVOCCommand(user, pwd, region, command);
      return result.vehicleId;
  });
  const vehicleIds = await Promise.all(finalArray);
  return vehicleIds;
};

async function getVehicleAttributes(user, pwd, region, vehicleIds) {
  let finalArray = vehicleIds.map(async(vehicleId) => {
      const result = await getVOCCommand(user, pwd, region, `vehicles/${vehicleId}/attributes`);
      return result;
  });
  const tempArray = await Promise.all(finalArray);
  return tempArray;
};

function postVOCCommandwithPosition(user, pwd, region, path, latitude, longitude) {
  var options = {
    timeout: 5000,
    protocol: apiProtocol,
    hostname: apiDomains[region],
    path: `${apiEndpoint}${path}`,
    json: {
      'clientAccuracy':0,
      'clientLatitude':latitude,
      'clientLongitude':longitude
    },
    headers: {
      'Accept': 'application/vnd.wirelesscar.com.voc.Service.v4+json; charset=utf-8',
      'X-Client-Version': '4.5.8.150888',
      'Accept-Language': 'en-us',
      'Accept-Encoding': 'br, gzip, deflate',
      'Content-Type': 'application/vnd.wirelesscar.com.voc.ClientPosition.v4+json; charset=utf-8',
      'X-Request-Id': '',
      'User-Agent': 'Volvo%20On%20Call/4.5.8.150888 CFNetwork/976 Darwin/18.2.0',
      'X-Os-Type': 'iPhone OS',
      'X-Device-Id': '11111A11-A111-11A1-A1AA-1111AAA1111A',
      'X-Os-Version': '12.1.4',
      'X-Originator-Type': 'app'
    },
    auth: `${user}:${pwd}`
  };

  return http.post(options)
    .then(function (response) {
      //console.log(response.data);
      return response.data;
    })
    .catch(reason => {
      console.error('Error in postVOCCommand', reason);
      //return Promise.reject(reason);
  });

}

function postVOCCommand(user, pwd, region, path, data) {
  var options = {
    timeout: 5000,
    protocol: apiProtocol,
    hostname: apiDomains[region],
    path: `${apiEndpoint}${path}`,
    json: true,
    headers: {
      'X-Client-Version': '4.5.8.150888',
      'Accept-Encoding': 'br, gzip, deflate',
      'Accept-Language': 'en-us',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Request-Id': '',
      'User-Agent': 'Volvo%20On%20Call/4.5.8.150888 CFNetwork/976 Darwin/18.2.0',
      'X-Os-Type': 'iPhone OS',
      'X-Device-Id': '11111A11-A111-11A1-A1AA-1111AAA1111A',
      'X-Os-Version': '12.1.4',
      'X-Originator-Type': 'app'
    },
    auth: `${user}:${pwd}`
  };

  if (data) {
    options.json = data;
  }

  //console.log(options);

  return http.post(options)
    .then(function (response) {
      //console.log(response.data);
      return response.data;
    })
    .catch(reason => {
      console.error('Error in postVOCCommand', reason);
      //return Promise.reject(reason);
  });

}

function getVOCCommand(user, pwd, region, path) {
  var options = {
    timeout: 5000,
    protocol: apiProtocol,
    hostname: apiDomains[region],
    path: `${apiEndpoint}${path}`,
    headers: {
      'X-Client-Version': '4.5.8.150888',
      'Accept-Encoding': 'br, gzip, deflate',
      'Accept-Language': 'en-us',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Request-Id': '',
      'User-Agent': 'Volvo%20On%20Call/4.5.8.150888 CFNetwork/976 Darwin/18.2.0',
      'X-Os-Type': 'iPhone OS',
      'X-Device-Id': '11111A11-A111-11A1-A1AA-1111AAA1111A',
      'X-Os-Version': '12.1.4',
      'X-Originator-Type': 'app'
    },
    auth: `${user}:${pwd}`
  };

  return http.json(options)
    .then(function (response) {
      return response;
    })
    .catch(reason => {
      console.error('Error in getVOCCommand', reason);
      //return Promise.reject(reason);
  });
}

exports = module.exports = VOC;
