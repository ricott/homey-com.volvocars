'use strict';

const apiDomain = 'api.volvocars.com';
const oAuthDomain = 'volvoid.eu.volvocars.com';
const apiTimeout = 10000;

const commands = {
    CLIMATIZATION_START: 'CLIMATIZATION_START',
    CLIMATIZATION_STOP: 'CLIMATIZATION_STOP',
    ENGINE_START: 'ENGINE_START',
    ENGINE_STOP: 'ENGINE_STOP',
    FLASH: 'FLASH',
    HONK: 'HONK',
    HONK_AND_FLASH: 'HONK_AND_FLASH',
    LOCK: 'LOCK',
    LOCK_REDUCED_GUARD: 'LOCK_REDUCED_GUARD',
    UNLOCK: 'UNLOCK',
}

const vehicleType = {
    ICE: 'ICE',
    HYBRID: 'HYBRID',
    ELECTRIC: 'ELECTRIC'
};

const chargingSystemStatus = {
    CHARGING_SYSTEM_CHARGING: 'CHARGING_SYSTEM_CHARGING',
    CHARGING_SYSTEM_IDLE: 'CHARGING_SYSTEM_IDLE',
    CHARGING_SYSTEM_DONE: 'CHARGING_SYSTEM_DONE',
    CHARGING_SYSTEM_FAULT: 'CHARGING_SYSTEM_FAULT',
    CHARGING_SYSTEM_SCHEDULED: 'CHARGING_SYSTEM_SCHEDULED',
    CHARGING_SYSTEM_UNSPECIFIED: 'CHARGING_SYSTEM_UNSPECIFIED'
};

const location = {
    HOME: 'home',
    AWAY: 'away',
    UNKNOWN: 'unknown'
}

const authState = {
    USERNAME_PASSWORD_REQUIRED: 'USERNAME_PASSWORD_REQUIRED',
    OTP_REQUIRED: 'OTP_REQUIRED',
    OTP_VERIFIED: 'OTP_VERIFIED',
    COMPLETED: 'COMPLETED'
}

// OAuth scopes - each on separate line for readability
const oauthScopes = [
    'openid',
    'email',
    'profile',
    'care_by_volvo:financial_information:invoice:read',
    'care_by_volvo:financial_information:payment_method',
    'care_by_volvo:subscription:read',
    'customer:attributes',
    'customer:attributes:write',
    'order:attributes',
    'vehicle:attributes',
    'tsp_customer_api:all',
    'conve:brake_status',
    'conve:climatization_start_stop',
    'conve:command_accessibility',
    'conve:commands',
    'conve:diagnostics_engine_status',
    'conve:diagnostics_workshop',
    'conve:doors_status',
    'conve:engine_status',
    //'conve:engine_start_stop', // Not allowed for the oauth scope
    'conve:environment',
    'conve:fuel_status',
    'conve:honk_flash',
    'conve:lock',
    'conve:lock_status',
    'conve:navigation',
    'conve:odometer_status',
    'conve:trip_statistics',
    'conve:tyre_status',
    'conve:unlock',
    'conve:vehicle_relation',
    'conve:warnings',
    'conve:windows_status',
    'energy:battery_charge_level',
    'energy:charging_connection_status',
    'energy:charging_system_status',
    'energy:electric_range',
    'energy:estimated_charging_time',
    'energy:recharge_status',
    'vehicle:attributes'
].join(' ');

module.exports = {
    apiDomain,
    oAuthDomain,
    apiTimeout,
    commands,
    vehicleType,
    chargingSystemStatus,
    location,
    authState,
    oauthScopes
}