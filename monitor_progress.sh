#!/bin/bash
# Subgraph Progress Monitor
echo "=== SUBGRAPH PROGRESS MONITOR ==="
echo "Timestamp: $(date)"
echo ""

# Get current status
RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" -d "{\"query\":\"{ _meta { block { number } hasIndexingErrors } }\"}" https://api.studio.thegraph.com/query/111767/polymarket-profit-and-loss-revised/v3.1.0-fixed-lastPriceUpdate)

BLOCK=$(echo $RESPONSE | jq -r ".data._meta.block.number")
ERRORS=$(echo $RESPONSE | jq -r ".data._meta.hasIndexingErrors")

echo "Current Block: $BLOCK"
echo "Has Errors: $ERRORS"

# Calculate progress
FAILURE_BLOCK=35887522
TRADING_BLOCK=40000000

if [ "$BLOCK" -lt "$FAILURE_BLOCK" ]; then
    PROGRESS=$(echo "scale=1; $BLOCK * 100 / $FAILURE_BLOCK" | bc)
    REMAINING=$(echo "scale=1; ($FAILURE_BLOCK - $BLOCK) / 1300000" | bc)
    echo "Progress to Failure Point: ${PROGRESS}%"
    echo "ETA to Critical Block: ${REMAINING} hours"
    echo "Status: 🟡 APPROACHING CRITICAL MILESTONE"
elif [ "$BLOCK" -ge "$FAILURE_BLOCK" ] && [ "$BLOCK" -lt "$TRADING_BLOCK" ]; then
    echo "Status: 🟢 PASSED CRITICAL MILESTONE! ($FAILURE_BLOCK)"
    REMAINING=$(echo "scale=1; ($TRADING_BLOCK - $BLOCK) / 1300000" | bc)
    echo "ETA to Trading Zone: ${REMAINING} hours"
else
    echo "Status: 🚀 IN TRADING ZONE!"
fi

echo ""

