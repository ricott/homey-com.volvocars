'use strict';

const { OAuth2App } = require('./lib/oauth2');
const VolvoOAuth2Client = require('./lib/VolvoOAuth2Client.js');
const { chargingSystemStatus, commands } = require('./lib/const');

class VOCApp extends OAuth2App {

    static OAUTH2_CLIENT = VolvoOAuth2Client; // Default: OAuth2Client
    // static OAUTH2_DEBUG = true; // Default: false

    async onOAuth2Init() {
        // Do App logic here

        this.log(`Volvo on Call v${this.#getAppVersion()} is running`);

        // Register common triggers
        this._car_left_home = this.homey.flow.getDeviceTriggerCard('car_left_home');
        this._car_came_home = this.homey.flow.getDeviceTriggerCard('car_came_home');
        this._engine_started = this.homey.flow.getDeviceTriggerCard('engine_started');
        this._engine_stopped = this.homey.flow.getDeviceTriggerCard('engine_stopped');
        this._location_human_changed = this.homey.flow.getDeviceTriggerCard('location_human_changed');
        this._fuel_range_changed = this.homey.flow.getDeviceTriggerCard('fuel_range_changed');
        this._battery_range_changed = this.homey.flow.getDeviceTriggerCard('battery_range_changed');
        this._charge_system_status_changed = this.homey.flow.getDeviceTriggerCard('charge_system_status_changed');
        this._charging_current_limit_changed = this.homey.flow.getDeviceTriggerCard('charging_current_limit_changed');

        this.#registerConditionFlows();
        this.#registerActions();
    }

    #getAppVersion() {
        return this.homey.manifest.version;
    }

    getChargingSystemStates() {
        let statusArray = [];
        Object.keys(chargingSystemStatus).forEach(key => {
            const val = String(chargingSystemStatus[key]).replace('CHARGING_SYSTEM_', '');
            statusArray.push({
                id: val,
                name: val
            })
        });

        statusArray.sort(function (a, b) {
            if (a.name > b.name) {
                return 1;
            }
            if (a.name < b.name) {
                return -1;
            }

            // names must be equal
            return 0;
        });

        return statusArray;
    }

    async triggerCarLeftHome(device) {
        await this._car_left_home.trigger(device, {}, {}).catch(this.error);
    }
    async triggerCarCameHome(device) {
        await this._car_came_home.trigger(device, {}, {}).catch(this.error);
    }
    async triggerEngineStarted(device) {
        await this._engine_started.trigger(device, {}, {}).catch(this.error);
    }
    async triggerEngineStopped(device, tokens) {
        await this._engine_stopped.trigger(device, tokens, {}).catch(this.error);
    }
    async triggerLocationHumanChanged(device, tokens) {
        await this._location_human_changed.trigger(device, tokens, {}).catch(this.error);
    }
    async triggerFuelRangeChanged(device, tokens) {
        await this._fuel_range_changed.trigger(device, tokens, {}).catch(this.error);
    }
    async triggerBatteryRangeChanged(device, tokens) {
        await this._battery_range_changed.trigger(device, tokens, {}).catch(this.error);
    }
    async triggerChargeSystemStatusChanged(device, tokens) {
        await this._charge_system_status_changed.trigger(device, tokens, {}).catch(this.error);
    }
    async triggerChargingCurrentLimitChanged(device, tokens) {
        await this._charging_current_limit_changed.trigger(device, tokens, {}).catch(this.error);
    }

    /**
     * Sign out of every saved OAuth2 session and mark all devices unavailable.
     *
     * This wipes the stored access/refresh tokens (the `OAuth2Sessions` setting
     * managed by `OAuth2App`) and destroys the in-memory clients. Devices stay
     * installed so the user can use the device's "Repair" flow to log in with
     * a different account, including a different Volvo ID, without removing
     * and re-pairing them.
     *
     * @returns {Promise<{ sessions: number, devices: number }>}
     */
    async signOutAllSessions() {
        const savedSessions = this.getSavedOAuth2Sessions();
        const sessionEntries = Object.entries(savedSessions);

        let devicesAffected = 0;

        for (const [sessionId, session] of sessionEntries) {
            const configId = session?.configId || 'default';

            // Mark every device tied to this session unavailable so the user
            // gets a clear "please re-authorize" state until they repair.
            try {
                const devices = await this.getOAuth2Devices({ sessionId, configId });
                for (const device of devices) {
                    try {
                        await device.setUnavailable('Signed out. Please use Repair to sign in again.');
                        devicesAffected++;
                    } catch (err) {
                        this.error(`Failed to mark device ${device.getName?.()} unavailable:`, err);
                    }
                }
            } catch (err) {
                this.error(`Failed to enumerate devices for session ${sessionId}:`, err);
            }

            // Destroy the in-memory client (if any) and remove the saved
            // session entry. deleteOAuth2Client() handles the settings update.
            try {
                if (this.hasOAuth2Client({ sessionId, configId })) {
                    const client = this.getOAuth2Client({ sessionId, configId });
                    client.destroy();
                } else {
                    this.deleteOAuth2Client({ sessionId, configId });
                }
            } catch (err) {
                this.error(`Failed to destroy client for session ${sessionId}:`, err);
                // Fall back to removing the saved entry directly.
                this.deleteOAuth2Client({ sessionId, configId });
            }
        }

        // Defensive cleanup in case any entries weren't removed above.
        this.homey.settings.set('OAuth2Sessions', {});

        this.log(`Signed out of ${sessionEntries.length} session(s), affected ${devicesAffected} device(s)`);
        return { sessions: sessionEntries.length, devices: devicesAffected };
    }
    async triggerHeaterStarted(device) {
        await this._heater_started.trigger(device, {}, {}).catch(this.error);
    }
    async triggerHeaterStopped(device) {
        await this._heater_stopped.trigger(device, {}, {}).catch(this.error);
    }

    #registerActions() {
        const executeCommand = this.homey.flow.getActionCard('executeCommand');
        executeCommand.registerRunListener(async (args) => {
            const deviceName = args.device.getName();
            const commandName = args.command.name;

            this.log(`[${deviceName}] Action 'executeCommand' triggered`);
            this.log(`[${deviceName}] Command name: '${commandName}'`);

            const client = args.device.oAuth2Client;
            const deviceId = args.device.getData().id;

            // Command mapping for cleaner code
            const commandHandlers = {
                [commands.CLIMATIZATION_START]: () => client.startClimatization(deviceId),
                [commands.CLIMATIZATION_STOP]: () => client.stopClimatization(deviceId),
                [commands.FLASH]: () => client.flash(deviceId),
                [commands.HONK]: () => client.honk(deviceId),
                [commands.HONK_AND_FLASH]: () => client.honkAndFlash(deviceId),
                [commands.LOCK]: () => client.lock(deviceId),
                [commands.LOCK_REDUCED_GUARD]: () => client.lockReducedGuard(deviceId),
                [commands.UNLOCK]: () => client.unlock(deviceId),
                [commands.ENGINE_START]: () => client.startEngine(deviceId),
                [commands.ENGINE_STOP]: () => client.stopEngine(deviceId),
            };

            const handler = commandHandlers[commandName];
            if (!handler) {
                const msg = `Unknown command '${commandName}'. The command is either erroneous or simply not implemented yet.`;
                this.log(msg);
                throw new Error(msg);
            }

            try {
                await handler();
                return true;
            } catch (error) {
                this.log(`[${deviceName}] Command '${commandName}' failed:`, error);
                throw error;
            }
        });

        executeCommand.registerArgumentAutocompleteListener('command', async (query, args) => {
            return args.device.getAvailableCommands();
        });
    }

    #registerConditionFlows() {
        this.log('Registering conditions');
        // Register conditions
        const engineState = this.homey.flow.getConditionCard('engineState');
        engineState.registerRunListener(async (args, state) => {
            this.log('Flow condition.engineState');
            const engineRunning = args.device.getCapabilityValue('engine');
            this.log(`- car.engine: ${engineRunning}`);
            return engineRunning;
        });

        const vehicleAtHome = this.homey.flow.getConditionCard('vehicleAtHome');
        vehicleAtHome.registerRunListener(async (args, state) => {
            this.log('Flow condition.vehicleAtHome');
            const isCarAtHome = args.device.isCarAtHome();
            this.log(`- car.home: ${isCarAtHome}`);
            return isCarAtHome;
        });

        const vehicleLocked = this.homey.flow.getConditionCard('vehicleLocked');
        vehicleLocked.registerRunListener(async (args, state) => {
            this.log('Flow condition.vehicleLocked');
            const locked = args.device.getCapabilityValue('locked');
            this.log(`- car.locked: ${locked}`);
            return locked;
        });

        const anyDoorOpen = this.homey.flow.getConditionCard('anyDoorOpen');
        anyDoorOpen.registerRunListener(async (args, state) => {
            this.log('Flow condition.anyDoorOpen');
            const anyDoorOpen = await args.device.isAnyDoorOpen();
            this.log(`- car.anyDoorOpen: ${anyDoorOpen}`);
            return anyDoorOpen;
        });

        const doorOpen = this.homey.flow.getConditionCard('doorOpen');
        doorOpen.registerRunListener(async (args, state) => {
            this.log('Flow condition.doorOpen');
            this.log(`- args.door: '${args.door}'`);
            const doorOpen = await args.device.isDoorOpen(args.door);
            this.log(`- doorOpen: ${doorOpen}`);
            return doorOpen;
        });

        const anyWindowOpen = this.homey.flow.getConditionCard('anyWindowOpen');
        anyWindowOpen.registerRunListener(async (args, state) => {
            this.log('Flow condition.anyWindowOpen');
            const anyWindowOpen = await args.device.isAnyWindowOpen();
            this.log(`- car.anyWindowOpen: ${anyWindowOpen}`);
            return anyWindowOpen;
        });

        const windowOpen = this.homey.flow.getConditionCard('windowOpen');
        windowOpen.registerRunListener(async (args, state) => {
            this.log('Flow condition.windowOpen');
            this.log(`- args.window: '${args.window}'`);
            const windowOpen = await args.device.isWindowOpen(args.window);
            this.log(`- windowOpen: ${windowOpen}`);
            return windowOpen;
        });

        const chargeSystemStatus = this.homey.flow.getConditionCard('chargeSystemStatus');
        chargeSystemStatus.registerRunListener(async (args, state) => {
            this.log('Flow condition.chargeSystemStatus');
            this.log(`- args.status: '${args.status.name}'`);
            const status = args.device.getCapabilityValue('charging_system_status');
            this.log(`- car.status: '${status}'`);
            return status == args.status.name;
        });
        chargeSystemStatus.registerArgumentAutocompleteListener('status',
            async (query, args) => {
                return this.getChargingSystemStates();
            }
        );

        const chargingCurrentLimitBelow = this.homey.flow.getConditionCard('chargingCurrentLimitBelow');
        chargingCurrentLimitBelow.registerRunListener(async (args, state) => {
            this.log('Flow condition.chargingCurrentLimitBelow');
            if (!args.device.hasCapability('charging_current_limit')) {
                this.log('- car does not support charging_current_limit');
                return false;
            }
            const limit = args.device.getCapabilityValue('charging_current_limit');
            this.log(`- car.charging_current_limit: ${limit}, threshold: ${args.ampere}`);
            if (limit == null) return false;
            return Number(limit) < Number(args.ampere);
        });
    }
}

module.exports = VOCApp;
