window.fetchGrubDirectoryPage=async function(path) {
    for (var attempt=0; ; attempt++) {
      try {
        var options={credentials:'omit',cache:'no-store',headers:{Accept:'application/json'}};
        if (window.AbortSignal && AbortSignal.timeout) options.signal=AbortSignal.timeout(12000);
        var res=await fetch(path,options);
        if (res.ok) return await res.json();
      } catch (error) {
        if (attempt>=2) throw error;
        res=null;
      }
      if (res && (attempt>=2 || (res.status<500 && res.status!==429))) throw Error('Directory unavailable');
      await new Promise(function(resolve){setTimeout(resolve,600*(attempt+1));});
    }
  };
