"""
本地 Agent 客户端入口
"""

import asyncio
import argparse
import os
from pathlib import Path

from local_agent import LocalAgentClient


def parse_args():
    parser = argparse.ArgumentParser(
        description="本地 Agent 客户端 - 连接到云端 Gateway"
    )

    parser.add_argument(
        "--gateway", "-g",
        default=os.environ.get("AGENT_GATEWAY_URL", "ws://localhost:18789"),
        help="Gateway 地址 (默认: ws://localhost:18789)"
    )

    parser.add_argument(
        "--workspace", "-w",
        default=os.getcwd(),
        help="工作区路径 (默认: 当前目录)"
    )

    parser.add_argument(
        "--tls", "-t",
        action="store_true",
        help="使用 TLS (wss://)"
    )

    parser.add_argument(
        "--api-key", "-k",
        default=os.environ.get("AGENT_API_KEY"),
        help="API 密钥"
    )

    parser.add_argument(
        "--client-id", "-c",
        default=os.environ.get("AGENT_CLIENT_ID", "local-agent"),
        help="客户端 ID"
    )

    return parser.parse_args()


async def main():
    args = parse_args()

    # 验证工作区
    workspace = Path(args.workspace).resolve()
    if not workspace.exists():
        print(f"错误: 工作区不存在: {workspace}")
        return

    print(f"""
╔════════════════════════════════════════════════════════════╗
║              Local Agent Client v0.1.0                     ║
╠════════════════════════════════════════════════════════════╣
║  Gateway:   {args.gateway:<46} ║
║  Workspace: {str(workspace):<46} ║
║  TLS:       {str(args.tls):<46} ║
║  Client ID: {args.client_id:<46} ║
╚════════════════════════════════════════════════════════════╝
    """)

    client = LocalAgentClient(
        gateway_url=args.gateway,
        workspace=str(workspace),
        use_tls=args.tls,
        api_key=args.api_key,
        client_id=args.client_id,
    )

    try:
        await client.connect()
    except KeyboardInterrupt:
        print("\n正在断开连接...")
        await client.disconnect()
        print("已断开连接")


if __name__ == "__main__":
    asyncio.run(main())
