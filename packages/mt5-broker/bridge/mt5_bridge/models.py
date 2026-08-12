from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field


class OrderRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=64)
    side: Literal["BUY", "SELL"]
    orderType: Literal["MARKET", "LIMIT", "STOP"]
    timeInForce: Literal["GTC", "DAY", "IOC", "FOK"]
    volume: float = Field(gt=0)
    requestedPrice: float = Field(gt=0)
    stopLoss: float = Field(gt=0)
    takeProfit: float = Field(gt=0)
    deviationPoints: int = Field(gt=0, le=10000)
    magicNumber: int = Field(gt=0)
    comment: str = Field(default="xauusd-ai-master", max_length=128)
    clientOrderId: str = Field(min_length=1, max_length=128)
    idempotencyKey: str = Field(min_length=1, max_length=256)
    expiresAt: int | None = None


class CloseRequest(BaseModel):
    volume: float = Field(gt=0)
    commandId: str = Field(min_length=1, max_length=256)


class ModifyRequest(BaseModel):
    stopLoss: float = Field(gt=0)
    takeProfit: float | None = Field(default=None, gt=0)
    commandId: str = Field(min_length=1, max_length=256)
