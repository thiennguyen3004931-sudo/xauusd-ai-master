export class MockProvider extends BaseMarketDataProvider {

    async connect(){}

    async disconnect(){}

    async getCandles(){

        return [];

    }

    async getLatestTick(){

        return {

            symbol:"XAUUSD",

            bid:0,

            ask:0,

            last:0,

            volume:0,

            timestamp:Date.now()

        };

    }

    async subscribe(){}

}