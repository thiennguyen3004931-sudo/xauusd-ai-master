import { TradingSession } from "../constants/TradingSession";

export class SessionService{

    getCurrentSession(date=new Date()){

        const hour=date.getUTCHours();

        if(hour<7){

            return TradingSession.ASIA;

        }

        if(hour<13){

            return TradingSession.LONDON;

        }

        return TradingSession.NEW_YORK;

    }

}