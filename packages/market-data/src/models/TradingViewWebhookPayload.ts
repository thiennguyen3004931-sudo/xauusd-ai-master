import { Candle } from "../entities/Candle";
import { Timeframe } from "../entities/Timeframe";
import { TradingViewWebhookPayload } from "../models/TradingViewWebhookPayload";

export class TradingViewWebhookMapper {

    static toCandle(
        payload:TradingViewWebhookPayload
    ): Candle {

        return {

            symbol:payload.symbol,

            timeframe:payload.timeframe as Timeframe,

            open:payload.open,

            high:payload.high,

            low:payload.low,

            close:payload.close,

            volume:payload.volume,

            openTime:payload.openTime,

            closeTime:payload.closeTime

        };

    }

}