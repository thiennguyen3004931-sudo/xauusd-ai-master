import { Candle } from "../entities/Candle";

export class CandleService {

    isBullish(candle:Candle){

        return candle.close>candle.open;

    }

    isBearish(candle:Candle){

        return candle.close<candle.open;

    }

    body(candle:Candle){

        return Math.abs(candle.close-candle.open);

    }

    range(candle:Candle){

        return candle.high-candle.low;

    }

}