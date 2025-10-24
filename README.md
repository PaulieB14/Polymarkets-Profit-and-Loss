# Enhanced Polymarket Subgraph

A comprehensive subgraph for Polymarket that tracks all trading activity, user positions, and market data with optimized performance following Graph Protocol best practices.

## 🚀 Best Practices Implemented

### ✅ Avoid Large Arrays
- **No large arrays in entities** - Uses `@derivedFrom` relationships instead
- **Efficient storage** - Each relationship is stored as a separate entity
- **Better performance** - Avoids database bloat from array copying
- **Time-travel queries** - Maintains historical data integrity

### ✅ Optimized Schema Design
- **Proper relationships** - Uses foreign keys and `@derivedFrom`
- **Efficient indexing** - Optimized for common query patterns
- **Scaled values** - Both raw and scaled values for frontend consumption
- **Aggregated statistics** - Reduces query complexity

### ✅ Performance Optimizations
- **Batch operations** - Efficient event handling
- **Proper data aggregation** - Daily/hourly statistics
- **Optimized mappings** - Minimal database operations
- **Efficient queries** - Uses `loadRelated` for derived fields

## 📊 Key Features

### Core Data Tracking
- **Conditional Token Framework (CTF)** events
- **Polymarket Exchange** orderbook trading
- **User positions** with P&L tracking
- **Market analytics** with price history
- **Global statistics** and aggregations

### Enhanced Analytics
- **Daily/Hourly statistics** for trend analysis
- **User portfolio tracking** with realized/unrealized P&L
- **Market performance metrics**
- **Trading volume and fee tracking**
- **Position management** (splits, merges, redemptions)

## 🏗️ Architecture

### Schema Design Principles
```graphql
# ❌ BAD: Large arrays that cause database bloat
type User {
  transactions: [String!]! # This creates copies on every update
}

# ✅ GOOD: Using @derivedFrom relationships
type User {
  transactions: [Transaction!]! @derivedFrom(field: "user")
}

type Transaction {
  user: User!
  # ... other fields
}
```

### Relationship Management
- **One-to-Many**: User → Transactions, Market → Positions
- **Many-to-One**: Transaction → User, Position → Market
- **Derived Fields**: All relationships use `@derivedFrom`
- **Efficient Queries**: Uses `loadRelated` for complex relationships

## 📈 Performance Benefits

### Database Efficiency
- **No array copying** - Each update creates a new row instead of copying arrays
- **Efficient storage** - Relationships stored as foreign keys
- **Better indexing** - PostgreSQL can optimize foreign key lookups
- **Reduced bloat** - No duplicate data in large arrays

### Query Performance
- **Faster queries** - Optimized for common patterns
- **Efficient joins** - Uses proper SQL joins instead of array operations
- **Scalable** - Performance doesn't degrade with data growth
- **Time-travel** - Maintains historical data integrity

## 🔧 Contracts Indexed

1. **Conditional Token Framework**: `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045`
   - Condition preparation and resolution
   - Position splitting and merging
   - Payout redemptions
   - Token transfers

2. **Polymarket Exchange**: `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E`
   - Order fills and matches
   - Fee tracking
   - Token registration
   - Trading analytics

## 🚀 Deployment

### Prerequisites
- Node.js 16+
- Graph CLI: `yarn global add @graphprotocol/graph-cli`

### Setup
```bash
# Install dependencies
yarn install

# Generate types
yarn codegen

# Build subgraph
yarn build
```

### Deploy to The Graph Studio
```bash
# Authenticate
graph auth --studio YOUR_DEPLOY_KEY

# Deploy
yarn deploy
```

## 📊 Query Examples

### User Portfolio (Using @derivedFrom)
```graphql
{
  account(id: "0x...") {
    totalRealizedPnl
    scaledTotalRealizedPnl
    positions {  # @derivedFrom relationship
      market {
        condition {
          questionId
        }
      }
      realizedPnl
      netQuantity
    }
    transactions {  # @derivedFrom relationship
      type
      tradeAmount
      timestamp
    }
  }
}
```

### Market Analytics
```graphql
{
  markets(first: 10, orderBy: totalVolume, orderDirection: desc) {
    id
    totalVolume
    scaledTotalVolume
    numTrades
    currentPrice
    positions {  # @derivedFrom relationship
      user {
        id
      }
      netQuantity
    }
  }
}
```

### Global Statistics
```graphql
{
  global(id: "") {
    numTraders
    tradesQuantity
    collateralVolume
    scaledCollateralVolume
  }
}
```

## 🎯 Key Entities

### Core Entities
- **Global**: Singleton with platform statistics
- **Account**: User data with trading history and P&L
- **Condition**: Market conditions with resolution data
- **Market**: Individual markets with trading data
- **Transaction**: All trading activity

### Analytics Entities
- **MarketPosition**: User positions per market
- **Orderbook**: Trading statistics per token
- **DailyStats**: Daily aggregated data
- **HourlyStats**: Hourly aggregated data

### Position Management
- **Split**: Position splitting events
- **Merge**: Position merging events
- **Redemption**: Payout redemption events

## 🔍 Best Practices Summary

1. **Avoid Large Arrays**: Use `@derivedFrom` relationships instead
2. **Efficient Storage**: Store relationships as foreign keys
3. **Optimized Queries**: Use proper SQL joins
4. **Performance**: No database bloat from array copying
5. **Scalability**: Performance doesn't degrade with growth
6. **Time-travel**: Maintains historical data integrity

## 📚 References

- [Graph Protocol Best Practices](https://thegraph.com/blog/best-practices-subgraph-development-avoiding-large-arrays)
- [@derivedFrom Documentation](https://thegraph.com/docs/en/developer/create-subgraph-hosted/#derivedfrom)
- [loadRelated Documentation](https://thegraph.com/docs/en/developer/create-subgraph-hosted/#loadrelated)

## 🆘 Support

For issues or questions:
1. Check the Graph Protocol documentation
2. Review the subgraph logs in The Graph Studio
3. Monitor indexing status and performance metrics
4. Follow best practices for schema design
