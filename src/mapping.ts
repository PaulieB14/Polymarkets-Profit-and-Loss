import { BigInt, BigDecimal, Bytes, ethereum } from "@graphprotocol/graph-ts"
import {
  ConditionPreparation,
  ConditionResolution,
  PositionSplit,
  PositionsMerge,
  PayoutRedemption,
  TransferSingle,
  TransferBatch
} from "../generated/ConditionalTokens/ConditionalTokens"
import {
  OrderFilled,
  OrdersMatched,
  OrderCancelled,
  TokenRegistered,
  FeeCharged
} from "../generated/PolymarketExchange/PolymarketExchange"
import {
  Global,
  Account,
  Collateral,
  Condition,
  Market,
  MarketPosition,
  Transaction,
  Split,
  Merge,
  Redemption,
  MarketProfit,
  Orderbook,
  OrderFilledEvent,
  OrdersMatchedEvent,
  DailyStats,
  TokenPosition,
  UserStats,
  SimpleUserPosition,
  SimpleMarketData,
  
} from "../generated/schema"

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

const ZERO_BI = BigInt.fromI32(0)
const ONE_BI = BigInt.fromI32(1)
const ZERO_BD = BigDecimal.fromString("0")
const ONE_BD = BigDecimal.fromString("1")

// USDC has 6 decimals

// =============================================================================
// P&L CALCULATION FUNCTIONS (Goldsky-style)
// =============================================================================

function updateUserPnL(account: Account, tokenId: BigInt, amount: BigInt, price: BigDecimal, isSell: boolean, market: Market): void {
  // Get or create TokenPosition (Goldsky-style entity)
  let tokenPositionId = account.id + "-" + tokenId.toString()
  let tokenPosition = TokenPosition.load(tokenPositionId)
  
  if (tokenPosition === null) {
    tokenPosition = new TokenPosition(tokenPositionId)
    tokenPosition.user = account.id
    tokenPosition.market = market.id
    tokenPosition.tokenId = tokenId
    tokenPosition.amount = ZERO_BI
    tokenPosition.avgPrice = ZERO_BI
    tokenPosition.realizedPnl = ZERO_BI
    tokenPosition.totalBought = ZERO_BI
  }
  
  // Convert price to USDC units (6 decimals) - Goldsky approach
  let priceInUsdc = BigInt.fromString(price.times(BigDecimal.fromString("1000000")).toString().split('.')[0])
  
  if (isSell) {
    // SELL: Calculate realized P&L (Goldsky approach)
    if (tokenPosition.amount.gt(ZERO_BI)) {
      let sellAmount = amount.gt(tokenPosition.amount) ? tokenPosition.amount : amount
      
      // Cost basis = avgPrice * sellAmount / 1e6 (to handle USDC precision)
      let costBasis = tokenPosition.avgPrice.times(sellAmount).div(BigInt.fromI32(1000000))
      
      // Sale value = currentPrice * sellAmount / 1e6 (to handle USDC precision)
      let saleValue = priceInUsdc.times(sellAmount).div(BigInt.fromI32(1000000))
      
      // Realized P&L = sale value - cost basis
      let realizedPnl = saleValue.minus(costBasis)
      
      // Update TokenPosition
      tokenPosition.realizedPnl = tokenPosition.realizedPnl.plus(realizedPnl)
      tokenPosition.amount = tokenPosition.amount.minus(sellAmount)
      
      // Update Account P&L
      account.totalRealizedPnl = account.totalRealizedPnl.plus(realizedPnl)
    }
  } else {
    // BUY: Update average price and position (Goldsky approach)
    let newTotalAmount = tokenPosition.amount.plus(amount)
    
    // Calculate weighted average price using BigInt arithmetic
    let currentValue = tokenPosition.avgPrice.times(tokenPosition.amount)
    let newValue = priceInUsdc.times(amount)
    let totalValue = currentValue.plus(newValue)
    
    if (newTotalAmount.gt(ZERO_BI)) {
      tokenPosition.avgPrice = totalValue.div(newTotalAmount)
    }
    
    tokenPosition.amount = newTotalAmount
    tokenPosition.totalBought = tokenPosition.totalBought.plus(amount)
  }
  
  tokenPosition.save()
  
  // Calculate unrealized P&L for all positions
  updateUnrealizedPnL(account)
  
  // Update win rate and other analytics
  updateAccountAnalytics(account)
}

function updateUnrealizedPnL(account: Account): void {
  // This would require current market prices - simplified for now
  // In a full implementation, you'd iterate through all TokenPositions for this user
  // and calculate unrealized P&L based on current market prices
  account.totalUnrealizedPnl = ZERO_BI // Placeholder - would need current prices
}

function updateAccountAnalytics(account: Account): void {
  // Calculate real win rate and profit factor from TokenPosition data
  
  if (account.numTrades.gt(ZERO_BI)) {
    // Calculate win rate from TokenPositions
    let winningPositions = 0
    let totalPositions = 0
    let totalProfits = ZERO_BI
    let totalLosses = ZERO_BI
    
    // Load all token positions for this account
    let tokenPositions = account.tokenPositions.load()
    
    for (let i = 0; i < tokenPositions.length; i++) {
      let position = tokenPositions[i]
      
      // Only count positions that have been traded (totalBought > 0)
      if (position.totalBought.gt(ZERO_BI)) {
        totalPositions++
        
        if (position.realizedPnl.gt(ZERO_BI)) {
          winningPositions++
          totalProfits = totalProfits.plus(position.realizedPnl)
        } else if (position.realizedPnl.lt(ZERO_BI)) {
          totalLosses = totalLosses.plus(position.realizedPnl.abs())
        }
      }
    }
    
    // Calculate win rate
    if (totalPositions > 0) {
      account.winRate = BigDecimal.fromString(winningPositions.toString()).div(BigDecimal.fromString(totalPositions.toString()))
    } else {
      account.winRate = ZERO_BD
    }
    
    // Calculate profit factor (total profits / total losses)
    if (totalLosses.gt(ZERO_BI)) {
      let profitsDecimal = totalProfits.toBigDecimal().div(BigDecimal.fromString("1000000000000")) // Convert from 12 decimal precision
      let lossesDecimal = totalLosses.toBigDecimal().div(BigDecimal.fromString("1000000000000"))
      account.profitFactor = profitsDecimal.div(lossesDecimal)
    } else if (totalProfits.gt(ZERO_BI)) {
      account.profitFactor = BigDecimal.fromString("999") // Very high profit factor (no losses)
    } else {
      account.profitFactor = ZERO_BD
    }
    
    // Max drawdown - use the largest single loss as approximation
    let maxSingleLoss = ZERO_BI
    for (let i = 0; i < tokenPositions.length; i++) {
      let position = tokenPositions[i]
      if (position.realizedPnl.lt(ZERO_BI) && position.realizedPnl.abs().gt(maxSingleLoss)) {
        maxSingleLoss = position.realizedPnl.abs()
      }
    }
    account.maxDrawdown = maxSingleLoss.neg()
  }
}
const USDC_DECIMALS = 6
const DECIMAL_FACTOR = BigInt.fromI32(10).pow(USDC_DECIMALS as u8)

function getOrCreateGlobal(): Global {
  let global = Global.load("")
  if (global === null) {
    global = new Global("")
    global.numConditions = 0
    global.numOpenConditions = 0
    global.numClosedConditions = 0
    global.numMarkets = 0
    global.numActiveMarkets = 0
    global.numTraders = ZERO_BI
    global.numUniqueTraders = ZERO_BI
    global.tradesQuantity = ZERO_BI
    global.buysQuantity = ZERO_BI
    global.sellsQuantity = ZERO_BI
    global.collateralVolume = ZERO_BI
    global.collateralBuyVolume = ZERO_BI
    global.collateralSellVolume = ZERO_BI
    global.collateralFees = ZERO_BI
    global.lastUpdated = ZERO_BI
    global.save()
  }
  return global as Global
}

function getOrCreateAccount(address: Bytes, timestamp: BigInt): Account {
  let account = Account.load(address.toHexString())
  if (account === null) {
    account = new Account(address.toHexString())
    account.creationTimestamp = timestamp
    account.lastSeenTimestamp = timestamp
    account.lastTradedTimestamp = ZERO_BI
    account.isActive = false
    account.numTrades = ZERO_BI
    account.collateralVolume = ZERO_BI
    account.totalRealizedPnl = ZERO_BI
    account.totalFeesPaid = ZERO_BI
    account.totalUnrealizedPnl = ZERO_BI
    account.winRate = ZERO_BD
    account.profitFactor = ZERO_BD
    account.maxDrawdown = ZERO_BI
    account.save()
  }
  return account as Account
}

function getOrCreateCollateral(address: Bytes): Collateral {
  let collateral = Collateral.load(address.toHexString())
  if (collateral === null) {
    collateral = new Collateral(address.toHexString())
    collateral.name = ""
    collateral.symbol = ""
    collateral.decimals = 0
    collateral.numMarkets = 0
    collateral.totalVolume = ZERO_BI
    collateral.save()
  }
  return collateral as Collateral
}

function getOrCreateCondition(conditionId: Bytes): Condition {
  let condition = Condition.load(conditionId.toHexString())
  if (condition === null) {
    condition = new Condition(conditionId.toHexString())
    condition.oracle = Bytes.empty()
    condition.questionId = Bytes.empty()
    condition.outcomeSlotCount = 0
    condition.resolutionTimestamp = null
    condition.resolutionHash = null
    condition.payoutNumerators = []
    condition.payoutDenominator = ZERO_BI
    condition.numMarkets = 0
    condition.totalVolume = ZERO_BI
    condition.save()
  }
  return condition as Condition
}

function getOrCreateMarket(marketId: string, condition: Condition, outcomeIndex: BigInt): Market {
  let market = Market.load(marketId)
  if (market === null) {
    market = new Market(marketId)
    market.condition = condition.id
    market.outcomeIndex = outcomeIndex
    market.isActive = true
    market.isResolved = false
    market.resolutionTimestamp = null
    market.totalVolume = ZERO_BI
    market.numTrades = ZERO_BI
    market.numBuyers = 0
    market.numSellers = 0
    market.currentPrice = null
    market.lastPriceUpdate = ZERO_BI
    market.save()
  }
  return market as Market
}

function getOrCreateOrderbook(tokenId: BigInt): Orderbook {
  let orderbook = Orderbook.load(tokenId.toString())
  if (orderbook === null) {
    orderbook = new Orderbook(tokenId.toString())
    orderbook.tradesQuantity = ZERO_BI
    orderbook.buysQuantity = ZERO_BI
    orderbook.sellsQuantity = ZERO_BI
    orderbook.collateralVolume = ZERO_BI
    orderbook.collateralBuyVolume = ZERO_BI
    orderbook.collateralSellVolume = ZERO_BI
    orderbook.totalFees = ZERO_BI
    orderbook.save()
  }
  return orderbook as Orderbook
}

function getOrCreateMarketPosition(user: Account, market: Market): MarketPosition {
  let positionId = user.id + "-" + market.id
  let position = MarketPosition.load(positionId)
  if (position === null) {
    position = new MarketPosition(positionId)
    position.user = user.id
    position.market = market.id
    position.quantityBought = ZERO_BI
    position.quantitySold = ZERO_BI
    position.netQuantity = ZERO_BI
    position.valueBought = ZERO_BI
    position.valueSold = ZERO_BI
    position.netValue = ZERO_BI
    position.feesPaid = ZERO_BI
    position.realizedPnl = ZERO_BI
    position.unrealizedPnl = ZERO_BI
    position.firstTradeTimestamp = ZERO_BI
    position.lastTradeTimestamp = ZERO_BI
    position.save()
  }
  return position as MarketPosition
}

function updateDailyStats(timestamp: BigInt, volume: BigInt, fees: BigInt): void {
  let dayId = timestamp.toI32() / 86400
  let dayStartTimestamp = dayId * 86400
  let dayStartTimestampBigInt = BigInt.fromI32(dayStartTimestamp)
  
  let dailyStats = DailyStats.load(dayId.toString())
  if (dailyStats === null) {
    dailyStats = new DailyStats(dayId.toString())
    dailyStats.date = dayId.toString()
    dailyStats.timestamp = dayStartTimestampBigInt
    dailyStats.numTrades = ZERO_BI
    dailyStats.numTraders = 0
    dailyStats.volume = ZERO_BI
    dailyStats.fees = ZERO_BI
    dailyStats.numActiveMarkets = 0
    dailyStats.numNewMarkets = 0
    dailyStats.numResolvedMarkets = 0
  }
  
  dailyStats.numTrades = dailyStats.numTrades.plus(ONE_BI)
  dailyStats.volume = dailyStats.volume.plus(volume)
  dailyStats.fees = dailyStats.fees.plus(fees)
  dailyStats.save()
}

function createPricePoint(market: Market, timestamp: BigInt, price: BigDecimal, volume: BigInt): void {
  let pricePointId = market.id + "-" + timestamp.toString()
}

// Helper functions for new entities
function getOrCreateTokenPosition(userId: string, tokenId: BigInt, marketId: string): TokenPosition {
  let tokenPositionId = userId + "-" + tokenId.toString()
  let tokenPosition = TokenPosition.load(tokenPositionId)
  
  if (tokenPosition === null) {
    tokenPosition = new TokenPosition(tokenPositionId)
    tokenPosition.user = userId
    tokenPosition.market = marketId
    tokenPosition.tokenId = tokenId
    tokenPosition.amount = ZERO_BI
    tokenPosition.avgPrice = ZERO_BI
    tokenPosition.realizedPnl = ZERO_BI
    tokenPosition.totalBought = ZERO_BI
    tokenPosition.save()
  }
  
  return tokenPosition as TokenPosition
}

function getOrCreateUserStats(userId: string): UserStats {
  let userStats = UserStats.load(userId)
  
  if (userStats === null) {
    userStats = new UserStats(userId)
    userStats.user = userId
    userStats.totalTrades = ZERO_BI
    userStats.totalVolume = ZERO_BI
    userStats.totalPnl = ZERO_BI
    userStats.winRate = ZERO_BD
    userStats.save()
  }
  
  return userStats as UserStats
}

function getOrCreateSimpleUserPosition(userId: string, tokenId: BigInt): SimpleUserPosition {
  let positionId = userId + "-" + tokenId.toString()
  let position = SimpleUserPosition.load(positionId)
  
  if (position === null) {
    position = new SimpleUserPosition(positionId)
    // Note: SimpleUserPosition fields will be defined in schema
    position.save()
  }
  
  return position as SimpleUserPosition
}

function getOrCreateSimpleMarketData(marketId: string): SimpleMarketData {
  let marketData = SimpleMarketData.load(marketId)
  
  if (marketData === null) {
    marketData = new SimpleMarketData(marketId)
    // Note: SimpleMarketData fields will be defined in schema
    marketData.save()
  }
  
  return marketData as SimpleMarketData
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

export function handleConditionPreparation(event: ConditionPreparation): void {
  let global = getOrCreateGlobal()
  let condition = getOrCreateCondition(event.params.conditionId)
  
  condition.oracle = event.params.oracle
  condition.questionId = event.params.questionId
  condition.outcomeSlotCount = event.params.outcomeSlotCount.toI32()
  condition.save()
  
  global.numConditions = global.numConditions + 1
  global.numOpenConditions = global.numOpenConditions + 1
  global.lastUpdated = event.block.timestamp
  global.save()
}

export function handleConditionResolution(event: ConditionResolution): void {
  let global = getOrCreateGlobal()
  let condition = getOrCreateCondition(event.params.conditionId)
  
  condition.resolutionTimestamp = event.block.timestamp
  condition.resolutionHash = event.transaction.hash
  condition.payoutNumerators = event.params.payoutNumerators
  condition.payoutDenominator = ZERO_BI // Calculate from numerators
  condition.save()
  
  global.numOpenConditions = global.numOpenConditions - 1
  global.numClosedConditions = global.numClosedConditions + 1
  global.lastUpdated = event.block.timestamp
  global.save()
}

export function handlePositionSplit(event: PositionSplit): void {
  let splitId = event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  let split = new Split(splitId)
  split.timestamp = event.block.timestamp
  split.blockNumber = event.block.number
  split.stakeholder = event.params.stakeholder.toHexString()
  split.collateralToken = event.params.collateralToken.toHexString()
  split.parentCollectionId = event.params.parentCollectionId
  split.condition = event.params.conditionId.toHexString()
  split.partition = event.params.partition
  split.amount = event.params.amount
  split.save()
  
  // Update account
  let account = getOrCreateAccount(event.params.stakeholder, event.block.timestamp)
  account.lastSeenTimestamp = event.block.timestamp
  account.save()
}

export function handlePositionsMerge(event: PositionsMerge): void {
  let mergeId = event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  let merge = new Merge(mergeId)
  merge.timestamp = event.block.timestamp
  merge.blockNumber = event.block.number
  merge.stakeholder = event.params.stakeholder.toHexString()
  merge.collateralToken = event.params.collateralToken.toHexString()
  merge.parentCollectionId = event.params.parentCollectionId
  merge.condition = event.params.conditionId.toHexString()
  merge.partition = event.params.partition
  merge.amount = event.params.amount
  merge.save()
  
  // Update account
  let account = getOrCreateAccount(event.params.stakeholder, event.block.timestamp)
  account.lastSeenTimestamp = event.block.timestamp
  account.save()
}

export function handlePayoutRedemption(event: PayoutRedemption): void {
  let redemptionId = event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  let redemption = new Redemption(redemptionId)
  redemption.timestamp = event.block.timestamp
  redemption.blockNumber = event.block.number
  redemption.redeemer = event.params.redeemer.toHexString()
  redemption.collateralToken = event.params.collateralToken.toHexString()
  redemption.parentCollectionId = event.params.parentCollectionId
  redemption.condition = event.params.conditionId.toHexString()
  redemption.indexSets = event.params.indexSets
  redemption.payout = event.params.payout
  redemption.save()
  
  // Update account
  let account = getOrCreateAccount(event.params.redeemer, event.block.timestamp)
  account.lastSeenTimestamp = event.block.timestamp
  account.save()
}

export function handleTransferSingle(event: TransferSingle): void {
  // Handle token transfers for position tracking
  let from = event.params.from
  let to = event.params.to
  let value = event.params.value
  
  if (from.toHexString() != "0x0000000000000000000000000000000000000000") {
    // Not a mint, update sender account
    let fromAccount = getOrCreateAccount(from, event.block.timestamp)
    fromAccount.lastSeenTimestamp = event.block.timestamp
    fromAccount.save()
  }
  
  if (to.toHexString() != "0x0000000000000000000000000000000000000000") {
    // Not a burn, update receiver account
    let toAccount = getOrCreateAccount(to, event.block.timestamp)
    toAccount.lastSeenTimestamp = event.block.timestamp
    toAccount.save()
  }
}

export function handleTransferBatch(event: TransferBatch): void {
  // Handle batch token transfers
  let from = event.params.from
  let to = event.params.to
  
  if (from.toHexString() != "0x0000000000000000000000000000000000000000") {
    let fromAccount = getOrCreateAccount(from, event.block.timestamp)
    fromAccount.lastSeenTimestamp = event.block.timestamp
    fromAccount.save()
  }
  
  if (to.toHexString() != "0x0000000000000000000000000000000000000000") {
    let toAccount = getOrCreateAccount(to, event.block.timestamp)
    toAccount.lastSeenTimestamp = event.block.timestamp
    toAccount.save()
  }
}

export function handleOrderFilled(event: OrderFilled): void {
  // Create OrderFilledEvent
  let orderFilledId = event.transaction.hash.toHexString() + "-" + event.params.orderHash.toHexString()
  let orderFilled = new OrderFilledEvent(orderFilledId)
  orderFilled.transactionHash = event.transaction.hash
  orderFilled.timestamp = event.block.timestamp
  orderFilled.blockNumber = event.block.number
  orderFilled.orderHash = event.params.orderHash
  orderFilled.maker = event.params.maker
  orderFilled.taker = event.params.taker
  orderFilled.makerAssetId = event.params.makerAssetId
  orderFilled.takerAssetId = event.params.takerAssetId
  orderFilled.makerAmountFilled = event.params.makerAmountFilled
  orderFilled.takerAmountFilled = event.params.takerAmountFilled
  orderFilled.fee = event.params.fee
  orderFilled.orderbook = event.params.makerAssetId.toString()
  
  // Calculate price (takerAmount / makerAmount)
  let price = ZERO_BD
  if (!event.params.makerAmountFilled.equals(ZERO_BI)) {
    price = event.params.takerAmountFilled.toBigDecimal().div(event.params.makerAmountFilled.toBigDecimal())
  }
  orderFilled.price = price
  
  // Determine side: if makerAssetId is lower, maker is selling outcome tokens for collateral
  let side = event.params.makerAssetId.lt(event.params.takerAssetId) ? "Sell" : "Buy"
  orderFilled.side = side
  orderFilled.size = event.params.makerAmountFilled
  orderFilled.save()
  
  // Try to find the market for this asset
  // Asset IDs are token IDs - we need to map them to market IDs
  let marketId = event.params.makerAssetId.toString()
  let market = Market.load(marketId)
  
  // If market doesn't exist, create a placeholder market with unknown condition
  // Use a fixed dummy condition ID (32 zero bytes) to avoid any Bytes conversion issues
  if (market === null) {
    let dummyConditionId = Bytes.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000000")
    let condition = getOrCreateCondition(dummyConditionId)
    market = getOrCreateMarket(marketId, condition, BigInt.fromI32(0))
  }
  
  // Create Transaction entities for maker and taker
  // Maker transaction
  let makerTxId = event.transaction.hash.toHexString() + "-maker-" + event.logIndex.toString()
  let makerTx = new Transaction(makerTxId)
  makerTx.type = side == "Sell" ? "Sell" : "Buy"
  makerTx.timestamp = event.block.timestamp
  makerTx.blockNumber = event.block.number
  makerTx.user = event.params.maker.toHexString()
  makerTx.market = market.id
  makerTx.tradeAmount = event.params.makerAmountFilled
  makerTx.feeAmount = event.params.fee
  makerTx.outcomeTokensAmount = event.params.makerAmountFilled
  makerTx.outcomeIndex = BigInt.fromI32(0) // Would need to decode from tokenId
  makerTx.price = price
  makerTx.save()
  
  // Taker transaction (opposite side)
  let takerTxId = event.transaction.hash.toHexString() + "-taker-" + event.logIndex.toString()
  let takerTx = new Transaction(takerTxId)
  takerTx.type = side == "Sell" ? "Buy" : "Sell"
  takerTx.timestamp = event.block.timestamp
  takerTx.blockNumber = event.block.number
  takerTx.user = event.params.taker.toHexString()
  takerTx.market = market.id
  takerTx.tradeAmount = event.params.takerAmountFilled
  takerTx.feeAmount = ZERO_BI // Fee typically paid by one side
  takerTx.outcomeTokensAmount = event.params.takerAmountFilled
  takerTx.outcomeIndex = BigInt.fromI32(1)
  takerTx.price = price
  takerTx.save()
  
  // Update maker account with P&L calculations
  let makerAccount = getOrCreateAccount(event.params.maker, event.block.timestamp)
  makerAccount.numTrades = makerAccount.numTrades.plus(ONE_BI)
  makerAccount.collateralVolume = makerAccount.collateralVolume.plus(event.params.makerAmountFilled)
  makerAccount.totalFeesPaid = makerAccount.totalFeesPaid.plus(event.params.fee)
  makerAccount.lastTradedTimestamp = event.block.timestamp
  makerAccount.lastSeenTimestamp = event.block.timestamp
  makerAccount.isActive = true
  
  // Update P&L for maker - FIXED LOGIC
  // Track P&L for whoever is trading outcome tokens (non-zero asset IDs)
  if (event.params.makerAssetId.gt(ZERO_BI)) {
    // Maker is trading outcome tokens
    let makerIsSelling = event.params.makerAssetId.gt(event.params.takerAssetId)
    updateUserPnL(makerAccount, event.params.makerAssetId, event.params.makerAmountFilled, price, makerIsSelling, market)
  } else if (event.params.takerAssetId.gt(ZERO_BI)) {
    // Maker is trading USDC for outcome tokens (buying outcome tokens)
    updateUserPnL(makerAccount, event.params.takerAssetId, event.params.takerAmountFilled, price, false, market)
  }
  makerAccount.save()
  
  // Update taker account with P&L calculations
  let takerAccount = getOrCreateAccount(event.params.taker, event.block.timestamp)
  takerAccount.numTrades = takerAccount.numTrades.plus(ONE_BI)
  takerAccount.collateralVolume = takerAccount.collateralVolume.plus(event.params.takerAmountFilled)
  takerAccount.lastTradedTimestamp = event.block.timestamp
  takerAccount.lastSeenTimestamp = event.block.timestamp
  takerAccount.isActive = true
  
  // Update P&L for taker - FIXED LOGIC
  // Track P&L for whoever is trading outcome tokens (non-zero asset IDs)
  if (event.params.takerAssetId.gt(ZERO_BI)) {
    // Taker is trading outcome tokens
    let takerIsSelling = event.params.takerAssetId.gt(event.params.makerAssetId)
    updateUserPnL(takerAccount, event.params.takerAssetId, event.params.takerAmountFilled, price, takerIsSelling, market)
  } else if (event.params.makerAssetId.gt(ZERO_BI)) {
    // Taker is trading USDC for outcome tokens (buying outcome tokens)
    updateUserPnL(takerAccount, event.params.makerAssetId, event.params.makerAmountFilled, price, false, market)
  }
  takerAccount.save()
  
  // Update market statistics
  market.totalVolume = market.totalVolume.plus(event.params.makerAmountFilled)
  market.numTrades = market.numTrades.plus(ONE_BI)
  market.currentPrice = price
  market.lastPriceUpdate = event.block.timestamp
  market.save()
  
  // Create price point for historical tracking
  createPricePoint(market, event.block.timestamp, price, event.params.makerAmountFilled)
  
  // Update market positions with proper value calculations
  let makerPosition = getOrCreateMarketPosition(makerAccount, market)
  if (side == "Sell") {
    makerPosition.quantitySold = makerPosition.quantitySold.plus(event.params.makerAmountFilled)
    // Value sold = quantity * price
    let valueSold = price.times(event.params.makerAmountFilled.toBigDecimal())
    makerPosition.valueSold = makerPosition.valueSold.plus(BigInt.fromString(valueSold.toString().split('.')[0]))
  } else {
    makerPosition.quantityBought = makerPosition.quantityBought.plus(event.params.makerAmountFilled)
    // Value bought = quantity * price  
    let valueBought = price.times(event.params.makerAmountFilled.toBigDecimal())
    makerPosition.valueBought = makerPosition.valueBought.plus(BigInt.fromString(valueBought.toString().split('.')[0]))
  }
  makerPosition.netQuantity = makerPosition.quantityBought.minus(makerPosition.quantitySold)
  makerPosition.netValue = makerPosition.valueBought.minus(makerPosition.valueSold)
  makerPosition.feesPaid = makerPosition.feesPaid.plus(event.params.fee)
  makerPosition.lastTradeTimestamp = event.block.timestamp
  if (makerPosition.firstTradeTimestamp.equals(ZERO_BI)) {
    makerPosition.firstTradeTimestamp = event.block.timestamp
  }
  makerPosition.save()
  
  let takerPosition = getOrCreateMarketPosition(takerAccount, market)
  if (side == "Sell") {
    // Taker is buying when maker is selling
    takerPosition.quantityBought = takerPosition.quantityBought.plus(event.params.takerAmountFilled)
    let valueBought = price.times(event.params.takerAmountFilled.toBigDecimal())
    takerPosition.valueBought = takerPosition.valueBought.plus(BigInt.fromString(valueBought.toString().split('.')[0]))
  } else {
    // Taker is selling when maker is buying
    takerPosition.quantitySold = takerPosition.quantitySold.plus(event.params.takerAmountFilled)
    let valueSold = price.times(event.params.takerAmountFilled.toBigDecimal())
    takerPosition.valueSold = takerPosition.valueSold.plus(BigInt.fromString(valueSold.toString().split('.')[0]))
  }
  takerPosition.netQuantity = takerPosition.quantityBought.minus(takerPosition.quantitySold)
  takerPosition.netValue = takerPosition.valueBought.minus(takerPosition.valueSold)
  takerPosition.lastTradeTimestamp = event.block.timestamp
  if (takerPosition.firstTradeTimestamp.equals(ZERO_BI)) {
    takerPosition.firstTradeTimestamp = event.block.timestamp
  }
  takerPosition.save()
  
  // Update orderbook
  let orderbook = getOrCreateOrderbook(event.params.makerAssetId)
  orderbook.tradesQuantity = orderbook.tradesQuantity.plus(ONE_BI)
  orderbook.collateralVolume = orderbook.collateralVolume.plus(event.params.makerAmountFilled)
  orderbook.totalFees = orderbook.totalFees.plus(event.params.fee)
  
  if (side == "Buy") {
    orderbook.buysQuantity = orderbook.buysQuantity.plus(ONE_BI)
    orderbook.collateralBuyVolume = orderbook.collateralBuyVolume.plus(event.params.makerAmountFilled)
  } else {
    orderbook.sellsQuantity = orderbook.sellsQuantity.plus(ONE_BI)
    orderbook.collateralSellVolume = orderbook.collateralSellVolume.plus(event.params.makerAmountFilled)
  }
  orderbook.save()
  
  // Update global stats
  let global = getOrCreateGlobal()
  global.tradesQuantity = global.tradesQuantity.plus(ONE_BI)
  global.collateralVolume = global.collateralVolume.plus(event.params.makerAmountFilled)
  global.collateralFees = global.collateralFees.plus(event.params.fee)
  
  if (side == "Buy") {
    global.buysQuantity = global.buysQuantity.plus(ONE_BI)
    global.collateralBuyVolume = global.collateralBuyVolume.plus(event.params.makerAmountFilled)
  } else {
    global.sellsQuantity = global.sellsQuantity.plus(ONE_BI)
    global.collateralSellVolume = global.collateralSellVolume.plus(event.params.makerAmountFilled)
  }
  
  global.lastUpdated = event.block.timestamp
  global.save()
  
  // Update daily stats
  updateDailyStats(event.block.timestamp, event.params.makerAmountFilled, event.params.fee)
}

export function handleOrdersMatched(event: OrdersMatched): void {
  let ordersMatched = new OrdersMatchedEvent(event.transaction.hash.toHexString())
  ordersMatched.timestamp = event.block.timestamp
  ordersMatched.blockNumber = event.block.number
  ordersMatched.makerAssetID = event.params.makerAssetId
  ordersMatched.takerAssetID = event.params.takerAssetId
  ordersMatched.makerAmountFilled = event.params.makerAmountFilled
  ordersMatched.takerAmountFilled = event.params.takerAmountFilled
  ordersMatched.save()
}

export function handleOrderCancelled(event: OrderCancelled): void {
  // Handle order cancellation
  // Could track cancelled orders if needed
}

export function handleTokenRegistered(event: TokenRegistered): void {
  // TokenRegistered is emitted when a new conditional token is registered
  // event.params.token0 and token1 are the outcome tokens
  // event.params.conditionId is the condition they belong to
  
  let condition = getOrCreateCondition(event.params.conditionId)
  let global = getOrCreateGlobal()
  
  // Create markets for each outcome token
  // Token0 = outcome 0, Token1 = outcome 1
  let market0Id = event.params.conditionId.toHexString() + "-0"
  let market1Id = event.params.conditionId.toHexString() + "-1"
  
  let market0 = getOrCreateMarket(market0Id, condition, BigInt.fromI32(0))
  let market1 = getOrCreateMarket(market1Id, condition, BigInt.fromI32(1))
  
  // Update condition stats
  condition.numMarkets = condition.numMarkets + 2
  condition.save()
  
  // Update global stats
  global.numMarkets = global.numMarkets + 2
  global.numActiveMarkets = global.numActiveMarkets + 2
  global.lastUpdated = event.block.timestamp
  global.save()
}

export function handleFeeCharged(event: FeeCharged): void {
  // FeeCharged event: receiver, tokenId, amount
  let account = getOrCreateAccount(event.params.receiver, event.block.timestamp)
  account.totalFeesPaid = account.totalFeesPaid.plus(event.params.amount)
  account.lastSeenTimestamp = event.block.timestamp
  account.save()
  
  // Update global fees
  let global = getOrCreateGlobal()
  global.collateralFees = global.collateralFees.plus(event.params.amount)
  global.lastUpdated = event.block.timestamp
  global.save()
  
  // Update daily stats
  updateDailyStats(event.block.timestamp, ZERO_BI, event.params.amount)
}

// Call handlers removed - events are faster and more reliable
// ConditionPreparation and ConditionResolution events handle all condition lifecycle
