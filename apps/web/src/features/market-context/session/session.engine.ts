export function detectSession(
    hour:number
){

    if(hour>=0 && hour<7)
        return "Asian";

    if(hour>=7 && hour<13)
        return "London";

    return "NewYork";

}