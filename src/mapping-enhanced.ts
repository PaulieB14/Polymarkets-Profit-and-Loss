import {
  BigInt,
  BigDecimal,
  Address,
  Bytes,
  log,
  store
} from "@graphprotocol/graph-ts"

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
  TokenPosition, // NEW: Goldsky pattern
  UserStats, // NEW: Goldsky-style aggregations
  Transaction,
  Orderbook,
  OrderFilledEvent,
  OrdersMatchedEvent,
  Split,
  Merge,
  Redemption,
  MarketProfit,
  PricePoint,
  DailyStats,
  HourlyStats,
  SimpleUserPosition, // NEW: Fast queries
  SimpleMarketData // NEW: Fast queries
} from "../generated/schema"

// =============================================================================
// CONSTANTS & UTILITIES (Enhanced)
// =============================================================================

const ZERO_BI = BigInt.fromI32(0)
const ONE_BI = BigInt.fromI32(1)
const ZERO_BD = BigDecimal.fromString("0")
const ONE_BD = BigDecimal.fromString("1")
const HUNDRED_BD = BigDecimal.fromString("100")

// Scaling factor for decimal conversion (6 decimals for USDC)
const SCALING_FACTOR = BigInt.fromI32(1000000)
const SCALING_FACTOR_BD = BigDecimal.fromString("1000000")

// Price scaling (basis points to decimal)
const PRICE_SCALING_FACTOR = BigInt.fromI32(1000000)
const PRICE_SCALING_FACTOR_BD = BigDecimal.fromString("1000000")

// =============================================================================
// UTILITY FUNCTIONS (Enhanced with Goldsky patterns)
// =============================================================================

function getOrCreateGlobal(): Global {
  let global = Global.load("")
  if (global == null) {
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
    global.scaledCollateralVolume = ZERO_BD
    global.collateralBuyVolume = ZERO_BI
    global.scaledCollateralBuyVolume = ZERO_BD
    global.collateralSellVolume = ZERO_BI
    global.scaledCollateralSellVolume = ZERO_BD
    global.collateralFees = ZERO_BI
    global.scaledCollateralFees = ZERO_BD
    
    // NEW: Goldsky-style P&L aggregations
    global.totalRealizedPnl = ZERO_BI
    global.scaledTotalRealizedPnl = ZERO_BD
    global.totalUnrealizedPnl = ZERO_BI
    global.scaledTotalUnrealizedPnl = ZERO_BD
    
    global.lastUpdated = ZERO_BI
    global.save()
  }
  return global
}

function getOrCreateAccount(address: Address): Account {
  let account = Account.load(address.toHexString())
  if (account == null) {
    account = new Account(address.toHexString())
    account.creationTimestamp = ZERO_BI
    account.lastSeenTimestamp = ZERO_BI
    account.lastTradedTimestamp = ZERO_BI
    account.isActive = true
    account.numTrades = ZERO_BI
    account.collateralVolume = ZERO_BI
    account.scaledCollateralVolume = ZERO_BD
    account.totalRealizedPnl = ZERO_BI
    account.scaledTotalRealizedPnl = ZERO_BD
    account.totalUnrealizedPnl = ZERO_BI
    account.scaledTotalUnrealizedPnl = ZERO_BD
    account.totalFeesPaid = ZERO_BI
    account.scaledTotalFeesPaid = ZERO_BD
    
    // NEW: Goldsky-style performance metrics
    account.winRate = ZERO_BD
    account.avgTradeSize = ZERO_BD
    account.profitFactor = ZERO_BD
    account.maxDrawdown = ZERO_BD
    
    account.save()
  }
  return account
}

// NEW: Goldsky's proven TokenPosition pattern
function getOrCreateTokenPosition(userAddress: Address, tokenId: BigInt, marketId: string): TokenPosition {
  let id = userAddress.toHexString() + "-" + tokenId.toString()
  let position = TokenPosition.load(id)
  
  if (position == null) {
    position = new TokenPosition(id)
    position.user = userAddress.toHexString()
    position.tokenId = tokenId
    position.market = marketId
    
    // Goldsky's core fields
    position.amount = ZERO_BI
    position.avgPrice = ZERO_BI
    position.realizedPnl = ZERO_BI
    position.totalBought = ZERO_BI
    position.totalSold = ZERO_BI
    
    // Enhanced fields
    position.scaledAmount = ZERO_BD
    position.scaledAvgPrice = ZERO_BD
    position.scaledRealizedPnl = ZERO_BD
    position.scaledTotalBought = ZERO_BD
    position.scaledTotalSold = ZERO_BD
    
    position.unrealizedPnl = ZERO_BI
    position.scaledUnrealizedPnl = ZERO_BD
    position.totalFeesPaid = ZERO_BI
    position.scaledTotalFeesPaid = ZERO_BD
    
    position.numTrades = ZERO_BI
    position.firstTradeTimestamp = ZERO_BI
    position.lastTradeTimestamp = ZERO_BI
    position.isActive = true
    
    position.save()
  }
  
  return position
}

// NEW: Goldsky-style UserStats aggregation
function getOrCreateUserStats(userAddress: Address): UserStats {
  let stats = UserStats.load(userAddress.toHexString())
  if (stats == null) {
    stats = new UserStats(userAddress.toHexString())
    stats.user = userAddress.toHexString()
    stats.totalRealizedPnl = ZERO_BI
    stats.totalVolume = ZERO_BI
    stats.activePositions = 0
    stats.totalPositions = 0
    stats.winRate = ZERO_BD
    stats.avgHoldTime = ZERO_BI
    stats.largestWin = ZERO_BI
    stats.largestLoss = ZERO_BI
    stats.sharpeRatio = ZERO_BD
    stats.maxDrawdown = ZERO_BD
    stats.volatility = ZERO_BD
    stats.scaledTotalRealizedPnl = ZERO_BD
    stats.scaledTotalVolume = ZERO_BD
    stats.scaledLargestWin = ZERO_BD
    stats.scaledLargestLoss = ZERO_BD
    stats.lastUpdated = ZERO_BI
    stats.save()
  }
  return stats
}

// NEW: Goldsky's P&L calculation logic
function updateTokenPositionPnL(
  position: TokenPosition,
  tradeAmount: BigInt,
  tradePrice: BigInt,
  isBuy: boolean,
  feeAmount: BigInt,
  timestamp: BigInt
): void {
  if (isBuy) {
    // Update average price using Goldsky's weighted average formula
    let totalCost = position.avgPrice.times(position.amount).plus(tradePrice.times(tradeAmount))
    let totalAmount = position.amount.plus(tradeAmount)
    
    if (totalAmount.gt(ZERO_BI)) {
      position.avgPrice = totalCost.div(totalAmount)
    }
    
    position.amount = position.amount.plus(tradeAmount)
    position.totalBought = position.totalBought.plus(tradeAmount)
    
  } else {
    // Calculate realized P&L using Goldsky's formula: (sellPrice - avgPrice) * amountSold
    let pnlPerToken = tradePrice.minus(position.avgPrice)
    let realizedPnl = pnlPerToken.times(tradeAmount).div(PRICE_SCALING_FACTOR)
    
    position.realizedPnl = position.realizedPnl.plus(realizedPnl)
    position.amount = position.amount.minus(tradeAmount)
    position.totalSold = position.totalSold.plus(tradeAmount)
  }
  
  // Update fees and timestamps
  position.totalFeesPaid = position.totalFeesPaid.plus(feeAmount)
  position.numTrades = position.numTrades.plus(ONE_BI)
  position.lastTradeTimestamp = timestamp
  
  if (position.firstTradeTimestamp.equals(ZERO_BI)) {
    position.firstTradeTimestamp = timestamp
  }
  
  // Update scaled values
  position.scaledAmount = position.amount.toBigDecimal().div(SCALING_FACTOR_BD)
  position.scaledAvgPrice = position.avgPrice.toBigDecimal().div(PRICE_SCALING_FACTOR_BD)
  position.scaledRealizedPnl = position.realizedPnl.toBigDecimal().div(SCALING_FACTOR_BD)
  position.scaledTotalBought = position.totalBought.toBigDecimal().div(SCALING_FACTOR_BD)
  position.scaledTotalSold = position.totalSold.toBigDecimal().div(SCALING_FACTOR_BD)
  position.scaledTotalFeesPaid = position.totalFeesPaid.toBigDecimal().div(SCALING_FACTOR_BD)
  
  position.isActive = position.amount.gt(ZERO_BI)
  position.save()
  
  // Update simple position for fast queries
  updateSimpleUserPosition(position)
}

// NEW: Update simple position for Goldsky-style fast queries
function updateSimpleUserPosition(position: TokenPosition): void {
  let simplePosition = SimpleUserPosition.load(position.id)
  if (simplePosition == null) {
    simplePosition = new SimpleUserPosition(position.id)
  }
  
  simplePosition.user = position.user
  simplePosition.tokenId = position.tokenId
  simplePosition.amount = position.amount
  simplePosition.avgPrice = position.avgPrice
  simplePosition.realizedPnl = position.realizedPnl
  simplePosition.totalBought = position.totalBought
  
  simplePosition.save()
}

function getOrCreateMarket(conditionId: string, outcomeIndex: BigInt): Market {
  let marketId = conditionId + "-" + outcomeIndex.toString()
  let market = Market.load(marketId)
  
  if (market == null) {
    market = new Market(marketId)
    market.condition = conditionId
    market.outcomeIndex = outcomeIndex
    market.isActive = true
    market.isResolved = false
    market.resolutionTimestamp = ZERO_BI
    market.totalVolume = ZERO_BI
    market.scaledTotalVolume = ZERO_BD
    market.numTrades = ZERO_BI
    market.numBuyers = 0
    market.numSellers = 0
    market.currentPrice = ZERO_BD
    market.lastPrice = ZERO_BD
    market.priceChange24h = ZERO_BD
    market.totalRealizedPnl = ZERO_BI
    market.scaledTotalRealizedPnl = ZERO_BD
    market.avgTradeSize = ZERO_BD
    market.save()
  }
  
  return market
}

function scaleValue(value: BigInt): BigDecimal {
  return value.toBigDecimal().div(SCALING_FACTOR_BD)
}

function scalePrice(price: BigInt): BigDecimal {
  return price.toBigDecimal().div(PRICE_SCALING_FACTOR_BD)
}

// =============================================================================
// CONDITIONAL TOKEN FRAMEWORK HANDLERS (Enhanced)
// =============================================================================

export function handleConditionPreparation(event: ConditionPreparation): void {
  let condition = new Condition(event.params.conditionId.toHexString())
  condition.oracle = event.params.oracle
  condition.questionId = event.params.questionId
  condition.outcomeSlotCount = event.params.outcomeSlotCount.toI32()
  condition.resolutionTimestamp = ZERO_BI
  condition.resolutionHash = Bytes.empty()
  condition.payoutNumerators = []
  condition.payoutDenominator = ZERO_BI
  condition.numMarkets = 0
  condition.totalVolume = ZERO_BI
  condition.scaledTotalVolume = ZERO_BD
  condition.totalRealizedPnl = ZERO_BI
  condition.scaledTotalRealizedPnl = ZERO_BD
  condition.save()

  // Update global stats
  let global = getOrCreateGlobal()
  global.numConditions = global.numConditions + 1
  global.numOpenConditions = global.numOpenConditions + 1
  global.lastUpdated = event.block.timestamp
  global.save()
}

export function handleConditionResolution(event: ConditionResolution): void {
  let condition = Condition.load(event.params.conditionId.toHexString())
  if (condition != null) {
    condition.resolutionTimestamp = event.block.timestamp
    condition.payoutNumerators = event.params.payoutNumerators
    condition.payoutDenominator = event.params.payoutDenominator
    condition.save()

    // Update global stats
    let global = getOrCreateGlobal()
    global.numOpenConditions = global.numOpenConditions - 1
    global.numClosedConditions = global.numClosedConditions + 1
    global.lastUpdated = event.block.timestamp
    global.save()
  }
}

export function handlePositionSplit(event: PositionSplit): void {
  let split = new Split(event.transaction.hash.toHexString())
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
  let account = getOrCreateAccount(event.params.stakeholder)
  account.lastSeenTimestamp = event.block.timestamp
  account.save()
}

export function handlePositionsMerge(event: PositionsMerge): void {
  let merge = new Merge(event.transaction.hash.toHexString())
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
  let account = getOrCreateAccount(event.params.stakeholder)
  account.lastSeenTimestamp = event.block.timestamp
  account.save()
}

export function handlePayoutRedemption(event: PayoutRedemption): void {
  let redemption = new Redemption(event.transaction.hash.toHexString())
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
  let account = getOrCreateAccount(event.params.redeemer)
  account.lastSeenTimestamp = event.block.timestamp
  account.save()
}

export function handleTransferSingle(event: TransferSingle): void {
  // Handle token transfers for position tracking
  if (event.params.from.notEqual(Address.zero()) && event.params.to.notEqual(Address.zero())) {
    // Update accounts
    let fromAccount = getOrCreateAccount(event.params.from)
    let toAccount = getOrCreateAccount(event.params.to)
    
    fromAccount.lastSeenTimestamp = event.block.timestamp
    toAccount.lastSeenTimestamp = event.block.timestamp
    
    fromAccount.save()
    toAccount.save()
  }
}

export function handleTransferBatch(event: TransferBatch): void {
  // Handle batch token transfers
  if (event.params.from.notEqual(Address.zero()) && event.params.to.notEqual(Address.zero())) {
    // Update accounts
    let fromAccount = getOrCreateAccount(event.params.from)
    let toAccount = getOrCreateAccount(event.params.to)
    
    fromAccount.lastSeenTimestamp = event.block.timestamp
    toAccount.lastSeenTimestamp = event.block.timestamp
    
    fromAccount.save()
    toAccount.save()
  }
}

// =============================================================================
// POLYMARKET EXCHANGE HANDLERS (Enhanced with Goldsky P&L logic)
// =============================================================================

export function handleOrderFilled(event: OrderFilled): void {
  let orderFilled = new OrderFilledEvent(
    event.transaction.hash.toHexString() + "-" + event.params.orderHash.toHexString()
  )
  
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
  
  // Calculate price and determine trade details
  let price = ZERO_BD
  let isBuy = false
  let tokenId = ZERO_BI
  let tradeAmount = ZERO_BI
  let tradeValue = ZERO_BI
  let trader = Address.zero()
  
  // Determine if this is a buy or sell based on asset IDs
  // In Polymarket, outcome tokens have high IDs, collateral (USDC) has low ID
  if (event.params.makerAssetId.gt(event.params.takerAssetId)) {
    // Maker is selling outcome tokens for collateral
    isBuy = false
    tokenId = event.params.makerAssetId
    tradeAmount = event.params.makerAmountFilled
    tradeValue = event.params.takerAmountFilled
    trader = event.params.maker
    price = event.params.takerAmountFilled.toBigDecimal()
      .div(event.params.makerAmountFilled.toBigDecimal())
  } else {
    // Taker is buying outcome tokens with collateral
    isBuy = true
    tokenId = event.params.takerAssetId
    tradeAmount = event.params.takerAmountFilled
    tradeValue = event.params.makerAmountFilled
    trader = event.params.taker
    price = event.params.makerAmountFilled.toBigDecimal()
      .div(event.params.takerAmountFilled.toBigDecimal())
  }
  
  // Convert price to basis points for consistency with Goldsky
  let priceInBasisPoints = price.times(PRICE_SCALING_FACTOR_BD).truncate(0).digits
  
  orderFilled.price = price
  orderFilled.size = tradeAmount
  orderFilled.side = isBuy ? "buy" : "sell"
  orderFilled.orderbook = tokenId.toString()
  orderFilled.fillPercentage = HUNDRED_BD // Assume full fill for now
  orderFilled.timeToFill = ZERO_BI // Would need order placement time
  orderFilled.save()
  
  // Create market if it doesn't exist
  // Note: We need to derive condition and outcome from tokenId
  // This is a simplified approach - in production, you'd need proper token ID parsing
  let conditionId = "condition-" + tokenId.toString() // Simplified
  let outcomeIndex = ZERO_BI // Simplified
  let market = getOrCreateMarket(conditionId, outcomeIndex)
  
  // NEW: Update TokenPosition using Goldsky's proven P&L logic
  let tokenPosition = getOrCreateTokenPosition(trader, tokenId, market.id)
  updateTokenPositionPnL(
    tokenPosition,
    tradeAmount,
    BigInt.fromString(priceInBasisPoints.toString()),
    isBuy,
    event.params.fee,
    event.block.timestamp
  )
  
  // Update account
  let account = getOrCreateAccount(trader)
  account.numTrades = account.numTrades.plus(ONE_BI)
  account.collateralVolume = account.collateralVolume.plus(tradeValue)
  account.scaledCollateralVolume = scaleValue(account.collateralVolume)
  account.totalFeesPaid = account.totalFeesPaid.plus(event.params.fee)
  account.scaledTotalFeesPaid = scaleValue(account.totalFeesPaid)
  account.lastTradedTimestamp = event.block.timestamp
  account.lastSeenTimestamp = event.block.timestamp
  
  // Update account P&L from all positions
  account.totalRealizedPnl = account.totalRealizedPnl.plus(tokenPosition.realizedPnl)
  account.scaledTotalRealizedPnl = scaleValue(account.totalRealizedPnl)
  account.save()
  
  // Update UserStats
  let userStats = getOrCreateUserStats(trader)
  userStats.totalRealizedPnl = account.totalRealizedPnl
  userStats.totalVolume = account.collateralVolume
  userStats.scaledTotalRealizedPnl = account.scaledTotalRealizedPnl
  userStats.scaledTotalVolume = account.scaledCollateralVolume
  userStats.lastUpdated = event.block.timestamp
  
  // Calculate win rate (simplified)
  if (tokenPosition.realizedPnl.gt(ZERO_BI)) {
    // This is a winning position, update win rate calculation
    // In production, you'd track this more precisely
  }
  
  userStats.save()
  
  // Update market
  market.totalVolume = market.totalVolume.plus(tradeValue)
  market.scaledTotalVolume = scaleValue(market.totalVolume)
  market.numTrades = market.numTrades.plus(ONE_BI)
  market.lastPrice = market.currentPrice
  market.currentPrice = price
  market.totalRealizedPnl = market.totalRealizedPnl.plus(tokenPosition.realizedPnl)
  market.scaledTotalRealizedPnl = scaleValue(market.totalRealizedPnl)
  
  if (market.numTrades.gt(ZERO_BI)) {
    market.avgTradeSize = market.scaledTotalVolume.div(market.numTrades.toBigDecimal())
  }
  
  market.save()
  
  // Update simple market data for fast queries
  let simpleMarket = SimpleMarketData.load(market.id)
  if (simpleMarket == null) {
    simpleMarket = new SimpleMarketData(market.id)
  }
  simpleMarket.tokenId = tokenId
  simpleMarket.currentPrice = price
  simpleMarket.volume24h = market.totalVolume // Simplified - would need 24h calculation
  simpleMarket.priceChange24h = market.currentPrice.minus(market.lastPrice)
  simpleMarket.isActive = market.isActive
  simpleMarket.save()
  
  // Update orderbook
  let orderbook = Orderbook.load(tokenId.toString())
  if (orderbook == null) {
    orderbook = new Orderbook(tokenId.toString())
    orderbook.tradesQuantity = ZERO_BI
    orderbook.buysQuantity = ZERO_BI
    orderbook.sellsQuantity = ZERO_BI
    orderbook.collateralVolume = ZERO_BI
    orderbook.scaledCollateralVolume = ZERO_BD
    orderbook.collateralBuyVolume = ZERO_BI
    orderbook.scaledCollateralBuyVolume = ZERO_BD
    orderbook.collateralSellVolume = ZERO_BI
    orderbook.scaledCollateralSellVolume = ZERO_BD
    orderbook.totalFees = ZERO_BI
    orderbook.scaledTotalFees = ZERO_BD
    orderbook.averageTradeSize = ZERO_BD
    orderbook.lastActiveDay = ZERO_BI
    orderbook.bidAskSpread = ZERO_BD
    orderbook.marketDepth = ZERO_BD
    orderbook.turnoverRate = ZERO_BD
  }
  
  orderbook.tradesQuantity = orderbook.tradesQuantity.plus(ONE_BI)
  orderbook.collateralVolume = orderbook.collateralVolume.plus(tradeValue)
  orderbook.scaledCollateralVolume = scaleValue(orderbook.collateralVolume)
  orderbook.totalFees = orderbook.totalFees.plus(event.params.fee)
  orderbook.scaledTotalFees = scaleValue(orderbook.totalFees)
  orderbook.lastActiveDay = event.block.timestamp.div(BigInt.fromI32(86400))
  
  if (isBuy) {
    orderbook.buysQuantity = orderbook.buysQuantity.plus(ONE_BI)
    orderbook.collateralBuyVolume = orderbook.collateralBuyVolume.plus(tradeValue)
    orderbook.scaledCollateralBuyVolume = scaleValue(orderbook.collateralBuyVolume)
  } else {
    orderbook.sellsQuantity = orderbook.sellsQuantity.plus(ONE_BI)
    orderbook.collateralSellVolume = orderbook.collateralSellVolume.plus(tradeValue)
    orderbook.scaledCollateralSellVolume = scaleValue(orderbook.collateralSellVolume)
  }
  
  if (orderbook.tradesQuantity.gt(ZERO_BI)) {
    orderbook.averageTradeSize = orderbook.scaledCollateralVolume.div(orderbook.tradesQuantity.toBigDecimal())
  }
  
  orderbook.save()
  
  // Update global stats
  let global = getOrCreateGlobal()
  global.tradesQuantity = global.tradesQuantity.plus(ONE_BI)
  global.collateralVolume = global.collateralVolume.plus(tradeValue)
  global.scaledCollateralVolume = scaleValue(global.collateralVolume)
  global.collateralFees = global.collateralFees.plus(event.params.fee)
  global.scaledCollateralFees = scaleValue(global.collateralFees)
  
  if (isBuy) {
    global.buysQuantity = global.buysQuantity.plus(ONE_BI)
    global.collateralBuyVolume = global.collateralBuyVolume.plus(tradeValue)
    global.scaledCollateralBuyVolume = scaleValue(global.collateralBuyVolume)
  } else {
    global.sellsQuantity = global.sellsQuantity.plus(ONE_BI)
    global.collateralSellVolume = global.collateralSellVolume.plus(tradeValue)
    global.scaledCollateralSellVolume = scaleValue(global.collateralSellVolume)
  }
  
  // Update global P&L
  global.totalRealizedPnl = global.totalRealizedPnl.plus(tokenPosition.realizedPnl)
  global.scaledTotalRealizedPnl = scaleValue(global.totalRealizedPnl)
  global.lastUpdated = event.block.timestamp
  global.save()
  
  // Create transaction record
  let transaction = new Transaction(event.transaction.hash.toHexString())
  transaction.type = isBuy ? "Buy" : "Sell"
  transaction.timestamp = event.block.timestamp
  transaction.blockNumber = event.block.number
  transaction.user = trader.toHexString()
  transaction.market = market.id
  transaction.tradeAmount = tradeAmount
  transaction.feeAmount = event.params.fee
  transaction.outcomeTokensAmount = tradeAmount
  transaction.outcomeIndex = outcomeIndex
  transaction.price = price
  transaction.scaledPrice = price
  transaction.tokenId = tokenId
  transaction.priceImpact = ZERO_BD // Would need orderbook depth calculation
  transaction.slippage = ZERO_BD // Would need expected vs actual price
  transaction.gasUsed = ZERO_BI // Would need receipt data
  transaction.gasPrice = ZERO_BI // Would need receipt data
  transaction.save()
  
  // Update daily stats
  updateDailyStats(event.block.timestamp, tradeValue, event.params.fee, tokenPosition.realizedPnl, price)
  
  // Update hourly stats
  updateHourlyStats(event.block.timestamp, tradeValue, event.params.fee, tokenPosition.realizedPnl)
}

export function handleOrdersMatched(event: OrdersMatched): void {
  let ordersMatched = new OrdersMatchedEvent(event.transaction.hash.toHexString())
  ordersMatched.timestamp = event.block.timestamp
  ordersMatched.blockNumber = event.block.number
  ordersMatched.makerAssetID = event.params.makerAssetID
  ordersMatched.takerAssetID = event.params.takerAssetID
  ordersMatched.makerAmountFilled = event.params.makerAmountFilled
  ordersMatched.takerAmountFilled = event.params.takerAmountFilled
  
  // Calculate match price and volume
  let matchPrice = event.params.takerAmountFilled.toBigDecimal()
    .div(event.params.makerAmountFilled.toBigDecimal())
  let volumeMatched = event.params.takerAmountFilled
  
  ordersMatched.matchPrice = matchPrice
  ordersMatched.volumeMatched = volumeMatched
  ordersMatched.scaledVolumeMatched = scaleValue(volumeMatched)
  ordersMatched.save()
}

export function handleOrderCancelled(event: OrderCancelled): void {
  // Handle order cancellation
  // This could be used to update orderbook depth and liquidity metrics
}

export function handleTokenRegistered(event: TokenRegistered): void {
  // Handle new token registration
  // This could be used to create new markets or update market metadata
}

export function handleFeeCharged(event: FeeCharged): void {
  // Handle fee charging events
  // Update account and global fee statistics
  let account = getOrCreateAccount(event.params.user)
  account.totalFeesPaid = account.totalFeesPaid.plus(event.params.amount)
  account.scaledTotalFeesPaid = scaleValue(account.totalFeesPaid)
  account.save()
  
  let global = getOrCreateGlobal()
  global.collateralFees = global.collateralFees.plus(event.params.amount)
  global.scaledCollateralFees = scaleValue(global.collateralFees)
  global.save()
}

// =============================================================================
// ANALYTICS HELPERS (Enhanced)
// =============================================================================

function updateDailyStats(
  timestamp: BigInt,
  volume: BigInt,
  fees: BigInt,
  realizedPnl: BigInt,
  price: BigDecimal
): void {
  let dayId = timestamp.div(BigInt.fromI32(86400))
  let dayStartTimestamp = dayId.times(BigInt.fromI32(86400))
  let date = new Date(dayStartTimestamp.toI32() * 1000).toISOString().split('T')[0]
  
  let dailyStats = DailyStats.load(date)
  if (dailyStats == null) {
    dailyStats = new DailyStats(date)
    dailyStats.date = date
    dailyStats.timestamp = dayStartTimestamp
    dailyStats.numTrades = ZERO_BI
    dailyStats.numTraders = 0
    dailyStats.volume = ZERO_BI
    dailyStats.scaledVolume = ZERO_BD
    dailyStats.fees = ZERO_BI
    dailyStats.scaledFees = ZERO_BD
    dailyStats.numActiveMarkets = 0
    dailyStats.numNewMarkets = 0
    dailyStats.numResolvedMarkets = 0
    dailyStats.totalRealizedPnl = ZERO_BI
    dailyStats.scaledTotalRealizedPnl = ZERO_BD
    dailyStats.avgTradeSize = ZERO_BD
    dailyStats.winRate = ZERO_BD
    dailyStats.avgBidAskSpread = ZERO_BD
    dailyStats.marketDepth = ZERO_BD
    dailyStats.priceVolatility = ZERO_BD
  }
  
  dailyStats.numTrades = dailyStats.numTrades.plus(ONE_BI)
  dailyStats.volume = dailyStats.volume.plus(volume)
  dailyStats.scaledVolume = scaleValue(dailyStats.volume)
  dailyStats.fees = dailyStats.fees.plus(fees)
  dailyStats.scaledFees = scaleValue(dailyStats.fees)
  dailyStats.totalRealizedPnl = dailyStats.totalRealizedPnl.plus(realizedPnl)
  dailyStats.scaledTotalRealizedPnl = scaleValue(dailyStats.totalRealizedPnl)
  
  if (dailyStats.numTrades.gt(ZERO_BI)) {
    dailyStats.avgTradeSize = dailyStats.scaledVolume.div(dailyStats.numTrades.toBigDecimal())
  }
  
  dailyStats.save()
}

function updateHourlyStats(
  timestamp: BigInt,
  volume: BigInt,
  fees: BigInt,
  realizedPnl: BigInt
): void {
  let hourId = timestamp.div(BigInt.fromI32(3600))
  let hourStartTimestamp = hourId.times(BigInt.fromI32(3600))
  let date = new Date(hourStartTimestamp.toI32() * 1000).toISOString().split('T')[0]
  let hour = new Date(hourStartTimestamp.toI32() * 1000).getUTCHours()
  let hourlyId = date + "-" + hour.toString().padStart(2, '0')
  
  let hourlyStats = HourlyStats.load(hourlyId)
  if (hourlyStats == null) {
    hourlyStats = new HourlyStats(hourlyId)
    hourlyStats.date = date
    hourlyStats.hour = hour
    hourlyStats.timestamp = hourStartTimestamp
    hourlyStats.numTrades = ZERO_BI
    hourlyStats.numTraders = 0
    hourlyStats.volume = ZERO_BI
    hourlyStats.scaledVolume = ZERO_BD
    hourlyStats.fees = ZERO_BI
    hourlyStats.scaledFees = ZERO_BD
    hourlyStats.totalRealizedPnl = ZERO_BI
    hourlyStats.scaledTotalRealizedPnl = ZERO_BD
    hourlyStats.avgTradeSize = ZERO_BD
  }
  
  hourlyStats.numTrades = hourlyStats.numTrades.plus(ONE_BI)
  hourlyStats.volume = hourlyStats.volume.plus(volume)
  hourlyStats.scaledVolume = scaleValue(hourlyStats.volume)
  hourlyStats.fees = hourlyStats.fees.plus(fees)
  hourlyStats.scaledFees = scaleValue(hourlyStats.fees)
  hourlyStats.totalRealizedPnl = hourlyStats.totalRealizedPnl.plus(realizedPnl)
  hourlyStats.scaledTotalRealizedPnl = scaleValue(hourlyStats.totalRealizedPnl)
  
  if (hourlyStats.numTrades.gt(ZERO_BI)) {
    hourlyStats.avgTradeSize = hourlyStats.scaledVolume.div(hourlyStats.numTrades.toBigDecimal())
  }
  
  hourlyStats.save()
}