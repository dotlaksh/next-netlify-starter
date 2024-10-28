import { useState, useEffect, useRef, useCallback } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';
import Papa from 'papaparse';
import axios from 'axios';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const TIME_PERIODS = [
  { label: '1W', days: 7 },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
];

const StockChart = () => {
  const [stockSymbols, setStockSymbols] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('3M');
  const [currentStats, setCurrentStats] = useState(null);
  
  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const resizeObserverRef = useRef(null);

  // Calculate chart height based on container height rather than window height
  const getChartHeight = useCallback(() => {
    if (chartContainerRef.current) {
      return chartContainerRef.current.clientHeight;
    }
    return 600; // Default fallback height
  }, []);

  // Load CSV data
  useEffect(() => {
    const loadCSV = async () => {
      try {
        const response = await fetch('/nifty50.csv');
        const text = await response.text();
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            const symbols = results.data.map(row => row.Symbol).filter(Boolean);
            setStockSymbols(symbols);
            if (symbols.length) fetchStockData(symbols[0], selectedPeriod);
          },
          error: (error) => {
            setError(`Failed to parse CSV file: ${error.message}`);
            setLoading(false);
          }
        });
      } catch (error) {
        setError(`Failed to load CSV file: ${error.message}`);
        setLoading(false);
      }
    };
    
    if (typeof window !== 'undefined') {
      loadCSV();
    }

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
      }
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    };
  }, []);

  const fetchStockData = useCallback(async (symbol, period) => {
    if (!symbol) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const endDate = new Date();
      const startDate = new Date();
      const days = TIME_PERIODS.find(t => t.label === period)?.days || 90;
      startDate.setDate(startDate.getDate() - days);

      const response = await axios.get('/api/stockData', {
        params: { symbol, startDate: startDate.toISOString(), endDate: endDate.toISOString() }
      });

      if (response.data?.length) {
        const formattedData = response.data.map(item => ({
          time: new Date(item.time).getTime() / 1000,
          open: parseFloat(item.open),
          high: parseFloat(item.high),
          low: parseFloat(item.low),
          close: parseFloat(item.close),
          volume: parseFloat(item.volume)
        }));
        
        setChartData(formattedData);
        
        const lastItem = formattedData[formattedData.length - 1];
        const prevItem = formattedData[formattedData.length - 2];
        const change = ((lastItem.close - prevItem.close) / prevItem.close * 100).toFixed(2);
        
        setCurrentStats({
          current: lastItem.close.toFixed(2),
          change: change,
          high: lastItem.high.toFixed(2),
          low: lastItem.low.toFixed(2),
          volume: (lastItem.volume / 1000000).toFixed(2) + 'M'
        });
      } else {
        setError('No data available for this symbol');
      }
    } catch (error) {
      setError(error.response?.data?.details || 'Failed to fetch stock data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize and update chart
  useEffect(() => {
    if (!chartContainerRef.current || !chartData.length || typeof window === 'undefined') return;

    const initChart = () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
      }

      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: getChartHeight(),
        layout: {
          background: { type: 'solid', color: '#ffffff' },
          textColor: '#333'
        },
        grid: {
          vertLines: { color: '#f0f0f0' },
          horzLines: { color: '#f0f0f0' }
        },
        crosshair: {
          mode: CrosshairMode.Normal
        },
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 5,
          minBarSpacing: 5,
        },
      });

      const candleSeries = chart.addCandlestickSeries({
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderVisible: false,
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
      });

      const volumeSeries = chart.addHistogramSeries({
        color: '#26a69a',
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        scaleMargins: {
          top: 0.8,
          bottom: 0,
        },
      });

      candleSeries.setData(chartData);
      volumeSeries.setData(
        chartData.map(item => ({
          time: item.time,
          value: item.volume,
          color: item.close > item.open ? '#26a69a' : '#ef5350'
        }))
      );

      chart.timeScale().fitContent();
      chartInstanceRef.current = chart;

      // Set up resize observer
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }

      resizeObserverRef.current = new ResizeObserver(entries => {
        if (chartInstanceRef.current) {
          const { width } = entries[0].contentRect;
          chartInstanceRef.current.applyOptions({ 
            width,
            height: getChartHeight()
          });
          chartInstanceRef.current.timeScale().fitContent();
        }
      });

      resizeObserverRef.current.observe(chartContainerRef.current);
    };

    // Small delay to ensure container is properly mounted
    const timer = setTimeout(initChart, 0);
    return () => clearTimeout(timer);
  }, [chartData, getChartHeight]);

  return (
    <div className="flex flex-col h-screen">
      <header className="h-16 bg-blue-600 text-white px-4">
        <div className="h-full max-w-screen-2xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold">Stock Charts</h1>
            <h2 className="text-lg">{stockSymbols[currentIndex]}</h2>
            {currentStats && (
              <div className="hidden md:flex items-center space-x-4 text-sm">
                <span className="font-bold">₹{currentStats.current}</span>
                <span className={currentStats.change >= 0 ? 'text-green-300' : 'text-red-300'}>
                  {currentStats.change}%
                </span>
                <span>H: ₹{currentStats.high}</span>
                <span>L: ₹{currentStats.low}</span>
                <span>Vol: {currentStats.volume}</span>
              </div>
            )}
          </div>
          <Select 
            value={selectedPeriod} 
            onValueChange={(value) => {
              setSelectedPeriod(value);
              fetchStockData(stockSymbols[currentIndex], value);
            }}
          >
            <SelectTrigger className="w-24 bg-white/10">
              <SelectValue placeholder="Time Period" />
            </SelectTrigger>
            <SelectContent>
              {TIME_PERIODS.map(period => (
                <SelectItem key={period.label} value={period.label}>
                  {period.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <main className="flex-1 relative">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">Loading...</div>
        ) : error ? (
          <div className="absolute inset-0 flex items-center justify-center text-red-500">{error}</div>
        ) : (
          <div ref={chartContainerRef} className="absolute inset-0" />
        )}
      </main>

      <footer className="h-16 bg-white shadow-md">
        <div className="h-full max-w-screen-2xl mx-auto px-4 flex justify-between items-center">
          <Button 
            variant="outline"
            disabled={currentIndex === 0} 
            onClick={() => {
              setCurrentIndex(prev => prev - 1);
              fetchStockData(stockSymbols[currentIndex - 1], selectedPeriod);
            }}
          >
            Previous
          </Button>
          <div>
            {currentIndex + 1} / {stockSymbols.length}
          </div>
          <Button 
            variant="outline"
            disabled={currentIndex === stockSymbols.length - 1} 
            onClick={() => {
              setCurrentIndex(prev => prev + 1);
              fetchStockData(stockSymbols[currentIndex + 1], selectedPeriod);
            }}
          >
            Next
          </Button>
        </div>
      </footer>
    </div>
  );
};

export default StockChart;
