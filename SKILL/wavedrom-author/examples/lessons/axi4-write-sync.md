AXI4 Full 四拍 INCR 写（18 条信号，32 半周期格）。ACLK 从 0 开始交替；所有格表示边沿后状态。ARESETn 初值 0，格 5 后释放。
AWVALID 格 7 后置 1，AWREADY 格 9 后置 1，格 11 握手后两者清 0，负载恢复 x。有效地址负载：AWID=字符串 1，AWADDR=0x1000，AWLEN=3 (4 beats)，AWSIZE=2 (4 bytes)，AWBURST=01 INCR，均使用字符串标签。
WVALID/WREADY 格 11 后置 1，WDATA=D0，WSTRB=0xF。格 13 接收 D0 后切换 D1，格 15 接收 D1 后切换 D2 且 WREADY 清 0。格 19 后 WREADY 置 1，格 21 接收 D2 后切换 D3 并置 WLAST=1。格 23 接收 D3 后 WVALID/WREADY/WLAST 清 0，负载恢复 x。WSTRB 有效期间保持 0xF。
格 25 后 BVALID 置 1、BID=字符串 1、BRESP=00 OKAY。格 27 后 BREADY 置 1。格 29 接收响应后 VALID/READY 清 0，负载恢复 x。
其余控制初值 0、负载初值 x。所有负载用字符串标签（D0 至 D3 是可读代号）。不添加 !。
先生成 LWF，再检查上升沿同步、AW/W/B 等待期间保持、四拍计数、最后一拍 WLAST、B 响应的前置握手与 ID。AW/W 是独立通道，本例顺序不代表协议强制依赖。
