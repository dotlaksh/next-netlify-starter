import { useState, useEffect, useRef } from 'react';
import { createChart } from 'lightweight-charts';
import Papa from 'papaparse';
import axios from 'axios';

export default function Home() {
  const [stockSymbols, setStockSymbols] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);

  useEffect(() => {
    const loadCSV = async () => {
      try {
        const response = await fetch('/nifty50.csv');
        if (!response.ok) {
          throw new Error('Failed to load CSV file');
        }
        
        const text = await response.text();
        
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          transform: (value) => value.trim(),
          complete: (results) => {
            console.log('CSV Parse Results:', results);
            
            const validData = results.data.filter(row => 
              row.Symbol && row.Symbol.trim().length > 0
            );

            if (validData.length === 0) {
              setError('No valid stock symbols found in CSV');
              setLoading(false);
              return;
            }

            const symbols = validData.map(row => row.Symbol.trim());
            console.log('Extracted symbols:', symbols);

            setStockSymbols(symbols);
            if (symbols.length > 0) {
              fetchStockData(symbols[0]);
            }
          },
          error: (error) => {
            console.error('CSV parsing error:', error);
            setError(`Failed to parse CSV file: ${error.message}`);
            setLoading(false);
          }
        });
      } catch (error) {
        console.error('Error loading CSV:', error);
        setError(`Failed to load CSV file: ${error.message}`);
        setLoading(false);
      }
    };
    
    loadCSV();
  }, []);

  const fetchStockData = async (symbol) => {
    setLoading(true);
    setError(null);
    
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 3);

      console.log(`Fetching data for ${symbol}`);
      
      const response = await axios.get('/api/stockData', {
        params: {
          symbol,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        }
      });

      if (response.data && response.data.length > 0) {
        const formattedData = response.data.map(item => ({
          time: item.time,
          open: parseFloat(item.open),
          high: parseFloat(item.high),
          low: parseFloat(item.low),
          close: parseFloat(item.close),
          volume: parseFloat(item.volume)
        }));
        
        console.log('Formatted chart data:', formattedData[0]);
        setChartData(formattedData);
      } else {
        setError('No data available for this symbol');
      }
    } catch (error) {
      console.error('Error fetching stock data:', error.response?.data || error.message);
      setError(error.response?.data?.details || 'Failed to fetch stock data');
    } finally {
      setLoading(false);
    }
  };

  // Chart initialization and update
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Clean up previous chart instance
    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
    }

    // Create new chart instance
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 750,
      layout: {
        background: { color: '#ffffff' },
        textColor: '#333',
      },
      grid: {
        vertLines: { color: '#f0f0f0' },
        horzLines: { color: '#f0f0f0' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      // Create two separate panes
      rightPriceScale: {
        scaleMargins: {
          top: 0.1,
          bottom: 0.3, // Leave space for volume pane
        },
      },
    });

    // Create candlestick series in the main pane
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    // Create volume series in a separate pane
    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'volume', // Unique ID for volume price scale
      scaleMargins: {
        top: 0.7, // Position volume pane at the bottom
        bottom: 0.05,
      },
    });

    // Configure volume price scale
    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: 0.7, // Match the volume series margins
        bottom: 0.05,
      },
      drawTicks: false, // Optional: hide ticks for cleaner look
    });

    // Set data if available
    if (chartData.length > 0) {
      candlestickSeries.setData(chartData);
      
      // Set volume data with colors based on price movement
      volumeSeries.setData(
        chartData.map(item => ({
          time: item.time,
          value: item.volume,
          color: item.close > item.open ? '#26a69a' : '#ef5350'
        }))
      );

      // Fit content
      chart.timeScale().fitContent();
    }

    // Store chart instance for cleanup
    chartInstanceRef.current = chart;

    // Handle resizing
    const handleResize = () => {
      if (chartInstanceRef.current && chartContainerRef.current) {
        chartInstanceRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
    };
  }, [chartData]);

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      fetchStockData(stockSymbols[currentIndex - 1]);
    }
  };

  const handleNext = () => {
    if (currentIndex < stockSymbols.length - 1) {
      setCurrentIndex(prev => prev + 1);
      fetchStockData(stockSymbols[currentIndex + 1]);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Top Navbar */}
      <nav className="bg-blue-600 text-white px-4 py-3 sm:px-6 shadow-lg">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="text-sm sm:text-base opacity-75">
            NSE Stock Chart
          </div>
          <h1 className="text-lg sm:text-xl font-bold truncate">
            {stockSymbols[currentIndex] || 'Loading...'}
          </h1>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-grow flex flex-col p-2 sm:p-4 md:p-6 overflow-hidden">
        <div className="bg-white rounded-lg shadow-lg flex-grow flex flex-col p-2 sm:p-4">
          {loading ? (
            <div className="flex-grow flex items-center justify-center">
              <div className="flex flex-col items-center space-y-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="text-gray-600">Loading chart data...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex-grow flex items-center justify-center">
              <div className="text-center space-y-2">
                <p className="text-red-600 text-lg">{error}</p>
                <button 
                  onClick={() => fetchStockData(stockSymbols[currentIndex])}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : (
            <div ref={chartContainerRef} className="flex-grow w-full h-[500px]" />
          )}
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav className="bg-white border-t shadow-lg px-4 py-3 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={handlePrevious}
              disabled={currentIndex === 0 || loading}
              className="px-3 py-2 sm:px-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm sm:text-base flex items-center space-x-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="hidden sm:inline">Previous</span>
            </button>
            
            <span className="text-sm sm:text-base text-gray-600">
              {currentIndex + 1} / {stockSymbols.length}
            </span>
            
            <button
              onClick={handleNext}
              disabled={currentIndex === stockSymbols.length - 1 || loading}
              className="px-3 py-2 sm:px-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm sm:text-base flex items-center space-x-1"
            >
              <span className="hidden sm:inline">Next</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </nav>
    </div>
  );
}
