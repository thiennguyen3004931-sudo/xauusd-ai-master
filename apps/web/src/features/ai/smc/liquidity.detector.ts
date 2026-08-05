export function detectLiquidity(
  spread: number
) {

  return {

    sweep: spread > 0.5,

  };

}