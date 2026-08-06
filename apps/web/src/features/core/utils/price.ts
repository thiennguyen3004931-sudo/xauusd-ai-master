export function roundPrice(
    value:number,
    digits=2
){

    return Number(
        value.toFixed(digits)
    );

}