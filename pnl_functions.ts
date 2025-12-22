// =============================================================================
// P&L CALCULATION FUNCTIONS
// =============================================================================

function updatePositionPnL(
  position: MarketPosition, 
  tradeAmount: BigInt, 
  tradePrice: BigDecimal, 
  isBuy: boolean,
  feeAmount: BigInt
): void {
  if (isBuy) {
    // Buying tokens - update cost basis
    position.quantityBought = position.quantityBought.plus(tradeAmount)
    position.valueBought = position.valueBought.plus(tradeAmount.toBigDecimal().times(tradePrice).toBigInt())
    position.feesPaid = position.feesPaid.plus(feeAmount)
    
    // Update net position
    position.netQuantity = position.quantityBought.minus(position.quantitySold)
    position.netValue = position.valueBought.minus(position.valueSold)
    
  } else {
    // Selling tokens - calculate realized P&L
    if (position.quantityBought.gt(ZERO_BI)) {
      // Calculate average cost basis
      let avgCostBasis = position.valueBought.toBigDecimal().div(position.quantityBought.toBigDecimal())
      
      // Calculate realized P&L for this sale
      let saleValue = tradeAmount.toBigDecimal().times(tradePrice)
      let costBasis = tradeAmount.toBigDecimal().times(avgCostBasis)
      let realizedPnlFromSale = saleValue.minus(costBasis).minus(feeAmount.toBigDecimal())
      
      // Update position
      position.quantitySold = position.quantitySold.plus(tradeAmount)
      position.valueSold = position.valueSold.plus(saleValue.toBigInt())
      position.realizedPnl = position.realizedPnl.plus(realizedPnlFromSale.toBigInt())
      position.feesPaid = position.feesPaid.plus(feeAmount)
      
      // Update net position
      position.netQuantity = position.quantityBought.minus(position.quantitySold)
      position.netValue = position.valueBought.minus(position.valueSold)
    }
  }
  
  // Calculate unrealized P&L (current market value - remaining cost basis)
  if (position.netQuantity.gt(ZERO_BI) && position.quantityBought.gt(ZERO_BI)) {
    let avgCost = position.valueBought.toBigDecimal().div(position.quantityBought.toBigDecimal())
    let remainingCostBasis = position.netQuantity.toBigDecimal().times(avgCost)
    let currentMarketValue = position.netQuantity.toBigDecimal().times(tradePrice)
    position.unrealizedPnl = currentMarketValue.minus(remainingCostBasis).toBigInt()
  } else {
    position.unrealizedPnl = ZERO_BI
  }
}

function updateTokenPosition(
  user: string,
  tokenId: BigInt,
  amount: BigInt,
  price: BigDecimal,
  isBuy: boolean,
  market: Market
): void {
  let tokenPositionId = user + "-" + tokenId.toString()
  let tokenPosition = TokenPosition.load(tokenPositionId)
  
  if (tokenPosition === null) {
    tokenPosition = new TokenPosition(tokenPositionId)
    tokenPosition.user = user
    tokenPosition.market = market.id
    tokenPosition.tokenId = tokenId
    tokenPosition.amount = ZERO_BI
    tokenPosition.avgPrice = ZERO_BI
    tokenPosition.realizedPnl = ZERO_BI
    tokenPosition.totalBought = ZERO_BI
  }
  
  if (isBuy) {
    // Update average price calculation (similar to Goldsky)
    let oldTotalCost = tokenPosition.totalBought
    let newTradeCost = amount.toBigDecimal().times(price).toBigInt()
    let newTotalBought = tokenPosition.totalBought.plus(newTradeCost)
    let newAmount = tokenPosition.amount.plus(amount)
    
    if (newAmount.gt(ZERO_BI)) {
      tokenPosition.avgPrice = newTotalBought.div(newAmount)
    }
    
    tokenPosition.amount = newAmount
    tokenPosition.totalBought = newTotalBought
    
  } else {
    // Selling - calculate realized P&L
    let saleValue = amount.toBigDecimal().times(price).toBigInt()
    let costBasis = amount.times(tokenPosition.avgPrice)
    let realizedPnlFromSale = saleValue.minus(costBasis)
    
    tokenPosition.amount = tokenPosition.amount.minus(amount)
    tokenPosition.realizedPnl = tokenPosition.realizedPnl.plus(realizedPnlFromSale)
    
    // If position is closed, reset avgPrice
    if (tokenPosition.amount.equals(ZERO_BI)) {
      tokenPosition.avgPrice = ZERO_BI
    }
  }
  
  tokenPosition.save()
}
