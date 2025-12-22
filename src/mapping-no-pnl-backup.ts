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
  
  // Update maker account
  let makerAccount = getOrCreateAccount(event.params.maker, event.block.timestamp)
  makerAccount.numTrades = makerAccount.numTrades.plus(ONE_BI)
  makerAccount.collateralVolume = makerAccount.collateralVolume.plus(event.params.makerAmountFilled)
  makerAccount.totalFeesPaid = makerAccount.totalFeesPaid.plus(event.params.fee)
  makerAccount.lastTradedTimestamp = event.block.timestamp
  makerAccount.lastSeenTimestamp = event.block.timestamp
  makerAccount.isActive = true
  makerAccount.save()
  
  // Update taker account
  let takerAccount = getOrCreateAccount(event.params.taker, event.block.timestamp)
  takerAccount.numTrades = takerAccount.numTrades.plus(ONE_BI)
  takerAccount.collateralVolume = takerAccount.collateralVolume.plus(event.params.takerAmountFilled)
  takerAccount.lastTradedTimestamp = event.block.timestamp
  takerAccount.lastSeenTimestamp = event.block.timestamp
  takerAccount.isActive = true
  takerAccount.save()
  
  // Update market statistics
  market.totalVolume = market.totalVolume.plus(event.params.makerAmountFilled)
  market.numTrades = market.numTrades.plus(ONE_BI)
  market.currentPrice = price
  market.save()
  
  // Create price point for historical tracking
  createPricePoint(market, event.block.timestamp, price, event.params.makerAmountFilled)
  
  // Update market positions
  let makerPosition = getOrCreateMarketPosition(makerAccount, market)
  if (side == "Sell") {
    makerPosition.quantitySold = makerPosition.quantitySold.plus(event.params.makerAmountFilled)
    makerPosition.valueSold = makerPosition.valueSold.plus(event.params.makerAmountFilled)
  } else {
    makerPosition.quantityBought = makerPosition.quantityBought.plus(event.params.makerAmountFilled)
    makerPosition.valueBought = makerPosition.valueBought.plus(event.params.makerAmountFilled)
  }
  makerPosition.netQuantity = makerPosition.quantityBought.minus(makerPosition.quantitySold)
  makerPosition.feesPaid = makerPosition.feesPaid.plus(event.params.fee)
  makerPosition.lastTradeTimestamp = event.block.timestamp
  if (makerPosition.firstTradeTimestamp.equals(ZERO_BI)) {
    makerPosition.firstTradeTimestamp = event.block.timestamp
  }
  makerPosition.save()
  
  let takerPosition = getOrCreateMarketPosition(takerAccount, market)
  if (side == "Sell") {
    takerPosition.quantityBought = takerPosition.quantityBought.plus(event.params.takerAmountFilled)
    takerPosition.valueBought = takerPosition.valueBought.plus(event.params.takerAmountFilled)
  } else {
    takerPosition.quantitySold = takerPosition.quantitySold.plus(event.params.takerAmountFilled)
    takerPosition.valueSold = takerPosition.valueSold.plus(event.params.takerAmountFilled)
  }
  takerPosition.netQuantity = takerPosition.quantityBought.minus(takerPosition.quantitySold)
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
