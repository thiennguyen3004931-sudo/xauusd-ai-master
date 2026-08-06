export function getTradingSession(
    hour:number
){

    if(hour<7){

        return "Sydney";

    }

    if(hour<13){

        return "Tokyo";

    }

    if(hour<18){

        return "London";

    }

    return "NewYork";

}