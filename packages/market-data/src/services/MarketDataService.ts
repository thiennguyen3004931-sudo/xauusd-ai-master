import { IMarketDataProvider } from "../interfaces/IMarketDataProvider";
import { ICandleRepository } from "../interfaces/ICandleRepository";
import { Timeframe } from "../entities/Timeframe";

export class MarketDataService {

    constructor(

        private readonly provider:IMarketDataProvider,

        private readonly repository:ICandleRepository

    ){}

    async loadHistory(

        symbol:string,

        timeframe:Timeframe,

        limit:number

    ){

        const candles=await this.provider.getCandles(

            symbol,

            timeframe,

            limit

        );

        await this.repository.saveMany(candles);

    }

}