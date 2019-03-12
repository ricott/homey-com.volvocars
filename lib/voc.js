'use strict';

var http = require('http.min');
var uuidv1 = require('uuid/v1');
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
  //Options should contain
  //username, password, region, uuid
  self.options = options;
  //Used for service invocations to check for result of invocation
  self._serviceInvocationSuccess = false;
}
util.inherits(VOC, EventEmitter);

VOC.prototype.login = function () {
  var self = this;
  return login(self.options)
    .then(function (result) {
      if (result.errorLabel) {
        return Promise.reject('invalid_user_password');
      }

      return result;
    })
    .catch(reason => {
      return Promise.reject('invalid_user_password');
    });
}

VOC.prototype.getVehicleAttributes = function (vehicleId) {
  var self = this;
  return getVehicleAttributes(self.options, [vehicleId])
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
  return refreshVehicleStatus(self.options, vehicleId)
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
  return startHeater(self.options, vehicleId)
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
  return stopHeater(self.options, vehicleId)
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

VOC.prototype.startPreClimatization = function (vehicleId) {
  var self = this;
  return startPreClimatization(self.options, vehicleId)
    .then(function (status) {
      return awaitSuccessfulServiceInvocation(self, vehicleId, status.customerServiceId)
        .then(function (result) {
          self.emit('car_action_status', {action: 'startPreClimatization', result: result});
          return result;
        })
    })
    .catch(reason => {
      self.emit('voc_api_error', reason);
      return Promise.reject(reason);
    });
}

VOC.prototype.stopPreClimatization = function (vehicleId) {
  var self = this;
  return stopPreClimatization(self.options, vehicleId)
    .then(function (status) {
      return awaitSuccessfulServiceInvocation(self, vehicleId, status.customerServiceId)
        .then(function (result) {
          self.emit('car_action_status', {action: 'stopPreClimatization', result: result});
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
  return lock(self.options, vehicleId)
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
  return unlock(self.options, vehicleId)
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
  return startEngine(self.options, vehicleId, duration)
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
  return stopEngine(self.options, vehicleId)
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
  return blinkLights(self.options, vehicleId, latitude, longitude)
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
  return honkHorn(self.options, vehicleId, latitude, longitude)
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
  return honkHornAndBlinkLights(self.options, vehicleId, latitude, longitude)
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
  return getVehicleStatus(self.options, vehicleId)
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
  return getVehiclePosition(self.options, vehicleId)
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
  return getRelationLinks(self.options)
    //.then(getVehicleIds)
    .then(function (relationLinks) {
      return getVehicleIds(self.options, relationLinks);
    })
    //.then(getVehicleAttributes)
    .then(function (vehicleIds) {
      return getVehicleAttributes(self.options, vehicleIds);
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
            vehicleType: vehicle.vehicleType,
            username: self.options.username,
            password: self.options.password
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

function login(options) {
  return getVOCCommand(options, 'customeraccounts')
    .then(function (data) {
      if (!data) return Promise.reject(new Error('getRelationLinks, api_error'));
      return data;
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

  return runFor(() => getServiceInvocationStatus(self.options, vehicleId, serviceId), 1000, self)
    .then(function (response) {
      let result = self._serviceInvocationSuccess;
      self._serviceInvocationSuccess = false;
      return result;
    })
    .catch(reason => {
      return Promise.reject(reason);
    });
}

function getServiceInvocationStatus(options, vehicleId, serviceId) {
  return getVOCCommand(options, `vehicles/${vehicleId}/services/${serviceId}`)
    .then(function (data) {
      if (!data) return Promise.reject(new Error('getServiceInvocationStatus, api_error'));
      console.log('Service invocation status: ', data.status);
      //return (data.status === 'Successful');
      return data.status;
  });
}

function startHeater(options, vehicleId) {
  return postVOCCommand(options, `vehicles/${vehicleId}/heater/start`, null)
    .then(function (data) {
      if (!data) return Promise.reject(new Error('startHeater, api_error'));
      return data;
  });
}
function stopHeater(options, vehicleId) {
  return postVOCCommand(options, `vehicles/${vehicleId}/heater/stop`, null)
    .then(function (data) {
      if (!data) return Promise.reject(new Error('stopHeater, api_error'));
      return data;
  });
}
function startPreClimatization(options, vehicleId) {
  return postVOCCommand(options, `vehicles/${vehicleId}/preclimatization/start`, null)
    .then(function (data) {
      if (!data) return Promise.reject(new Error('startPreClimatization, api_error'));
      return data;
  });
}
function stopPreClimatization(options, vehicleId) {
  return postVOCCommand(options, `vehicles/${vehicleId}/preclimatization/stop`, null)
    .then(function (data) {
      if (!data) return Promise.reject(new Error('stopPreClimatization, api_error'));
      return data;
  });
}

function lock(options, vehicleId) {
  return postVOCCommand(options, `vehicles/${vehicleId}/lock`, null)
    .then(function (data) {
      if (!data) return Promise.reject(new Error('lock, api_error'));
      return data;
  });
}
function unlock(options, vehicleId) {
  return postVOCCommand(options, `vehicles/${vehicleId}/unlock`, null)
    .then(function (data) {
      if (!data) return Promise.reject(new Error('unlock, api_error'));
      return data;
  });
}

function startEngine(options, vehicleId, duration) {
  return postVOCCommand(options, `vehicles/${vehicleId}/engine/start`, {runtime: duration})
    .then(function (data) {
      if (!data) return Promise.reject(new Error('stopEngine, api_error'));
      return data;
  });
}

function stopEngine(options, vehicleId) {
  return postVOCCommand(options, `vehicles/${vehicleId}/engine/stop`, null)
    .then(function (data) {
      if (!data) return Promise.reject(new Error('stopEngine, api_error'));
      return data;
  });
}

function blinkLights(options, vehicleId, latitude, longitude) {
  return postVOCCommandwithPosition(options,
                                  `vehicles/${vehicleId}/honk_blink/lights`,
                                  latitude, longitude)
    .then(function (data) {
      if (!data) return Promise.reject(new Error('blinkLights, api_error'));
      return data;
  });
}
function honkHorn(options, vehicleId, latitude, longitude) {
  return postVOCCommandwithPosition(options,
                                  `vehicles/${vehicleId}/honk_blink/horn`,
                                  latitude, longitude)
    .then(function (data) {
      if (!data) return Promise.reject(new Error('honkHorn, api_error'));
      return data;
  });
}
function honkHornAndBlinkLights(options, vehicleId, latitude, longitude) {
  return postVOCCommandwithPosition(options,
                                  `vehicles/${vehicleId}/honk_blink/both`,
                                  latitude, longitude)
    .then(function (data) {
      if (!data) return Promise.reject(new Error('honkAndBlinkLights, api_error'));
      return data;
  });
}



function refreshVehicleStatus(options, vehicleId) {
  return postVOCCommand(options, `vehicles/${vehicleId}/updatestatus`, null)
    .then(function (data) {
      if (!data) return Promise.reject(new Error('refreshVehicleStatus, api_error'));
      return data;
  });
}

function getVehicleStatus(options, vehicleId) {
  return getVOCCommand(options, `vehicles/${vehicleId}/status`)
    .then(function (data) {
      if (!data) return Promise.reject(new Error('getVehicleStatus, api_error'));
      return data;
  });
}

function getVehiclePosition(options, vehicleId) {
  return getVOCCommand(options, `vehicles/${vehicleId}/position?client_longitude=0.000000&client_precision=0.000000&client_latitude=0.000000`)
    .then(function (data) {
      if (!data) return Promise.reject(new Error('getVehiclePosition, api_error'));
      return data.position;
  });
}

function getRelationLinks(options) {
  let relationLinks = [];
  return getVOCCommand(options, 'customeraccounts')
    .then(function (data) {
      if (!data) return Promise.reject(new Error('getRelationLinks, api_error'));

      data.accountVehicleRelations.forEach(link => {
        let command = link.substring(link.indexOf('/vehicle-account-relations'));
        relationLinks.push(command);
      });
      return relationLinks;
  });
}

async function getVehicleIds(options, relationLinks) {
  let finalArray = relationLinks.map(async(command) => {
      const result = await getVOCCommand(options, command);
      return result.vehicleId;
  });
  const vehicleIds = await Promise.all(finalArray);
  return vehicleIds;
};

async function getVehicleAttributes(options, vehicleIds) {
  let finalArray = vehicleIds.map(async(vehicleId) => {
      const result = await getVOCCommand(options, `vehicles/${vehicleId}/attributes`);
      return result;
  });
  const tempArray = await Promise.all(finalArray);
  return tempArray;
};

function postVOCCommandwithPosition(options, path, latitude, longitude) {
  var options = {
    timeout: 5000,
    protocol: apiProtocol,
    hostname: apiDomains[options.region],
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
      'X-Request-Id': uuidv1().toUpperCase(),
      'User-Agent': 'Volvo%20On%20Call/4.5.8.150888 CFNetwork/976 Darwin/18.2.0',
      'X-Os-Type': 'iPhone OS',
      'X-Device-Id': options.uuid,
      'X-Os-Version': '12.1.4',
      'X-Originator-Type': 'app'
    },
    auth: `${options.username}:${options.password}`
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

function postVOCCommand(options, path, data) {
  var options = {
    timeout: 5000,
    protocol: apiProtocol,
    hostname: apiDomains[options.region],
    path: `${apiEndpoint}${path}`,
    json: true,
    headers: {
      'X-Client-Version': '4.5.8.150888',
      'Accept-Encoding': 'br, gzip, deflate',
      'Accept-Language': 'en-us',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Request-Id': uuidv1().toUpperCase(),
      'User-Agent': 'Volvo%20On%20Call/4.5.8.150888 CFNetwork/976 Darwin/18.2.0',
      'X-Os-Type': 'iPhone OS',
      'X-Device-Id': options.uuid,
      'X-Os-Version': '12.1.4',
      'X-Originator-Type': 'app'
    },
    auth: `${options.username}:${options.password}`
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

function getVOCCommand(options, path) {
  var options = {
    timeout: 5000,
    protocol: apiProtocol,
    hostname: apiDomains[options.region],
    path: `${apiEndpoint}${path}`,
    headers: {
      'X-Client-Version': '4.5.8.150888',
      'Accept-Encoding': 'br, gzip, deflate',
      'Accept-Language': 'en-us',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Request-Id': uuidv1().toUpperCase(),
      'User-Agent': 'Volvo%20On%20Call/4.5.8.150888 CFNetwork/976 Darwin/18.2.0',
      'X-Os-Type': 'iPhone OS',
      'X-Device-Id': options.uuid,
      'X-Os-Version': '12.1.4',
      'X-Originator-Type': 'app'
    },
    auth: `${options.username}:${options.password}`
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
