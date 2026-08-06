import { Candle } from "../entities/Candle";

export class CandleValidator {

    static validate(candle:Candle){

        if(candle.high<candle.low){

            throw new Error("Invalid Candle");

        }

        if(candle.openTime>=candle.closeTime){

            throw new Error("Invalid Time");

        }

    }

}