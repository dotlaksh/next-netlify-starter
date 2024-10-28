import { useState, useEffect, useRef, useCallback } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
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

  // Debug logging
  useEffect(() => {
    console.log('Chart Data:', chartData);
    console.log('Container Ref:', chartContainerRef.current);
  }, [chartData]);

  useEffect(() => {
    const loadCSV = async () => {
      try {
        const response = await fetch('/nifty50.csv');
        const text = await response.text();
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            console.log('CSV Data:', results.data);
            const symbols = results.data.map(row => row.Symbol).filter(Boolean);
            setStockSymbols(symbols);
            if (symbols.length) fetchStockData(symbols[0], selectedPeriod);
          },
          error: (error) => {
            console.error('CSV Parse Error:', error);
            setError(`Failed to parse CSV file: ${error.message}`);
            setLoading(false);
          }
        });
      } catch (error) {
        console.error('CSV Load Error:', error);
        setError(`Failed to load CSV file: ${error.message}`);
        setLoading(false);
      }
    };
    
    loadCSV();

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
      }
    };
  }, []);

  const fetchStockData = useCallback(async (symbol, period) => {
    setLoading(true);
    setError(null);
    
    try {
      const endDate = new Date();
      const startDate = new Date();
      const days = TIME_PERIODS.find(t => t.label === period)?.days || 90;
      startDate.setDate(startDate.getDate() - days);

      // Debug log
      console.log('Fetching data for:', symbol, startDate, endDate);

      const response = await axios.get('/api/stockData', {
        params: { symbol, startDate: startDate.toISOString(), endDate: endDate.toISOString() }
      });

      console.log('API Response:', response.data);

      if (response.data?.length) {
        const formattedData = response.data.map(item => ({
          time: typeof item.time === 'string' ? new Date(item.time).getTime() / 1000 : item.time,
          open: Number(item.open),
          high: Number(item.high),
          low: Number(item.low),
          close: Number(item.close),
          volume: Number(item.volume)
        }));
        
        console.log('Formatted Data:', formattedData);
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
        console.error('No data in response');
        setError('No data available for this symbol');
      }
    } catch (error) {
      console.error('API Error:', error);
      setError(error.response?.data?.details || 'Failed to fetch stock data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!chartContainerRef.current || !chartData.length) {
      console.log('Missing requirements:', {
        container: !!chartContainerRef.current,
        dataLength: chartData.length
      });
      return;
    }

    const initChart = () => {
      try {
        if (chartInstanceRef.current) {
          chartInstanceRef.current.remove();
        }

        // Get container dimensions
        const container = chartContainerRef.current;
        const containerHeight = window.innerHeight - 128; // Subtract header and footer heights

        console.log('Container dimensions:', {
          width: container.clientWidth,
          height: containerHeight
        });

        const chart = createChart(container, {
          width: container.clientWidth,
          height: containerHeight,
          layout: {
            background: { type: ColorType.Solid, color: '#ffffff' },
            textColor: '#333333',
          },
          grid: {
            vertLines: { color: '#f0f0f0' },
            horzLines: { color: '#f0f0f0' },
          },
        });

        // Add price series
        const mainSeries = chart.addCandlestickSeries({
          upColor: '#26a69a',
          downColor: '#ef5350',
          borderVisible: false,
          wickUpColor: '#26a69a',
          wickDownColor: '#ef5350',
        });

        // Add volume series
        const volumeSeries = chart.addHistogramSeries({
          color: '#26a69a',
          priceFormat: {
            type: 'volume',
          },
          priceScaleId: 'volume',
          scaleMargins: {
            top: 0.8,
            bottom: 0,
          },
        });

        // Set the data
        console.log('Setting chart data:', chartData);
        mainSeries.setData(chartData);
        volumeSeries.setData(
          chartData.map(item => ({
            time: item.time,
            value: item.volume,
            color: item.close > item.open ? '#26a69a' : '#ef5350'
          }))
        );

        // Fit the content
        chart.timeScale().fitContent();

        // Store the chart instance
        chartInstanceRef.current = chart;

        // Handle resize
        const handleResize = () => {
          const newHeight = window.innerHeight - 128;
          chart.applyOptions({
            width: container.clientWidth,
            height: newHeight
          });
          chart.timeScale().fitContent();
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
      } catch (error) {
        console.error('Chart initialization error:', error);
        setError('Failed to initialize chart');
      }
    };

    initChart();
  }, [chartData]);

  // Navigation handlers
  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      fetchStockData(stockSymbols[currentIndex - 1], selectedPeriod);
    }
  };

  const handleNext = () => {
    if (currentIndex < stockSymbols.length - 1) {
      setCurrentIndex(prev => prev + 1);
      fetchStockData(stockSymbols[currentIndex + 1], selectedPeriod);
    }
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Fixed Header */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-blue-600 text-white px-4 z-50">
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

      {/* Main Content */}
      <main className="flex-grow pt-16 pb-16">
        {loading ? (
          <div className="flex items-center justify-center h-full">Loading...</div>
        ) : error ? (
          <div className="text-red-500 text-center h-full flex items-center justify-center">{error}</div>
        ) : (
          <div 
            ref={chartContainerRef} 
            className="w-full h-full"
            style={{ minHeight: '200px' }}
          />
        )}
      </main>

      {/* Fixed Footer */}
      <footer className="fixed bottom-0 left-0 right-0 h-16 bg-white shadow-md z-50">
        <div className="h-full max-w-screen-2xl mx-auto px-4 flex justify-between items-center">
          <Button 
            variant="outline"
            disabled={currentIndex === 0} 
            onClick={handlePrevious}
          >
            Previous
          </Button>
          <div>
            {currentIndex + 1} / {stockSymbols.length}
          </div>
          <Button 
            variant="outline"
            disabled={currentIndex === stockSymbols.length - 1} 
            onClick={handleNext}
          >
            Next
          </Button>
        </div>
      </footer>
    </div>
  );
};

export default StockChart;
