#!/usr/bin/env python3
"""
GoedGepickt API - Order Ophalen Script
Haalt order details op via de GET /orders/{orderId} endpoint
"""

import requests
import json
import sys
from typing import Dict, Optional


class GoedGepicktAPI:
    """GoedGepickt API Client voor order opvragen"""
    
    def __init__(self, api_key: str, base_url: str = "https://account.goedgepickt.nl/api/v1"):
        """
        Initialiseer de API client
        
        Args:
            api_key: Je GoedGepickt API key
            base_url: Base URL van de API (standaard: https://account.goedgepickt.nl/api/v1)
        """
        self.api_key = api_key
        self.base_url = base_url.rstrip('/')
        self.headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    
    def get_product(self, product_uuid: str) -> Optional[Dict]:
        """
        Haal product details op inclusief voorraad informatie
        
        Args:
            product_uuid: Het UUID van het product
            
        Returns:
            Dict met product gegevens, of None bij een fout
        """
        url = f"{self.base_url}/products/{product_uuid}"
        
        try:
            response = requests.get(url, headers=self.headers, timeout=30)
            
            if response.status_code == 200:
                return response.json()
            elif response.status_code == 404:
                return None
            else:
                print(f"⚠️  Product API error: {response.status_code}", file=sys.stderr)
                return None
                
        except Exception as e:
            print(f"⚠️  Error fetching product: {str(e)}", file=sys.stderr)
            return None
    
    def get_order(self, order_id: str) -> Optional[Dict]:
        """
        Haal een specifieke order op
        
        Args:
            order_id: Het ID van de order
            
        Returns:
            Dict met order gegevens, of None bij een fout
        """
        url = f"{self.base_url}/orders/{order_id}"
        
        print(f"🔍 DEBUG - URL: {url}")
        print(f"🔍 DEBUG - Authorization: Bearer {self.api_key[:20]}...")
        
        try:
            response = requests.get(url, headers=self.headers, timeout=30)
            
            print(f"🔍 DEBUG - Status Code: {response.status_code}")
            print(f"🔍 DEBUG - Response: {response.text}")
            
            # Check of de request succesvol was
            if response.status_code == 200:
                return response.json()
            elif response.status_code == 401:
                print("❌ Authenticatie gefaald.", file=sys.stderr)
                print("   Mogelijke oorzaken:", file=sys.stderr)
                print("   - API key is verlopen of ongeldig", file=sys.stderr)
                print("   - API key heeft niet de juiste rechten", file=sys.stderr)
                print("   - API key moet opnieuw gegenereerd worden in GoedGepickt > Instellingen > GoedGepickt API", file=sys.stderr)
                return None
            elif response.status_code == 404:
                print(f"❌ Order '{order_id}' niet gevonden.", file=sys.stderr)
                print("   Mogelijke oorzaken:", file=sys.stderr)
                print("   - Order ID is incorrect", file=sys.stderr)
                print("   - Order bestaat niet in jouw account", file=sys.stderr)
                print("   - Je hebt geen toegang tot deze order", file=sys.stderr)
                return None
            else:
                print(f"❌ API error: {response.status_code}", file=sys.stderr)
                print(f"Response: {response.text}", file=sys.stderr)
                return None
                
        except requests.exceptions.Timeout:
            print("❌ Request timeout - probeer het later opnieuw.", file=sys.stderr)
            return None
        except requests.exceptions.ConnectionError:
            print("❌ Verbindingsfout - controleer je internetverbinding.", file=sys.stderr)
            return None
        except Exception as e:
            print(f"❌ Onverwachte fout: {str(e)}", file=sys.stderr)
            return None
    
    def print_order_details(self, order: Dict):
        """Print order details in een leesbaar formaat"""
        print("\n" + "="*60)
        print("RAW ORDER RESPONSE")
        print("="*60)
        print(json.dumps(order, indent=2, ensure_ascii=False))
        print("="*60)
        
        # Print product backorder status met stock informatie
        print("\n" + "="*60)
        print("PRODUCT VOORRAAD & BACKORDER STATUS")
        print("="*60)
        
        if 'products' in order:
            for product in order['products']:
                product_name = product.get('productName', 'N/A')
                sku = product.get('sku', 'N/A')
                product_type = product.get('type', 'normal')
                product_uuid = product.get('productUuid')
                quantity = product.get('productQuantity', 0)
                picked = product.get('pickedQuantity', 0)
                
                indent = "  " if product_type == "child" else ""
                type_label = f" [{product_type}]" if product_type != "normal" else ""
                
                print(f"\n{indent}{'='*50}")
                print(f"{indent}📦 {product_name}{type_label}")
                print(f"{indent}SKU: {sku}")
                print(f"{indent}Besteld: {quantity} | Gepickt: {picked}")
                
                # Haal product details op voor voorraad info
                if product_uuid:
                    product_details = self.get_product(product_uuid)
                    if product_details and 'stock' in product_details:
                        stock = product_details['stock']
                        free_stock = stock.get('freeStock', 0)
                        total_stock = stock.get('totalStock', 0)
                        reserved_stock = stock.get('reservedStock', 0)
                        unlimited = stock.get('unlimitedStock', False)
                        allow_backorders = product_details.get('allowBackorders', False)
                        
                        # Bepaal status
                        if unlimited:
                            status = "✅ ONBEPERKTE VOORRAAD"
                            print(f"{indent}{status}")
                        elif free_stock < 0:
                            backorder_qty = abs(free_stock)
                            status = f"⚠️  IN BACKORDER - {backorder_qty} stuks tekort"
                            print(f"{indent}{status}")
                        elif free_stock == 0 and total_stock > 0:
                            status = "✅ OP VOORRAAD - Volledig gereserveerd"
                            print(f"{indent}{status}")
                        elif free_stock > 0:
                            status = f"✅ OP VOORRAAD - {free_stock} vrij beschikbaar"
                            print(f"{indent}{status}")
                        else:
                            status = "⚠️  GEEN VOORRAAD"
                            print(f"{indent}{status}")
                        
                        print(f"{indent}Voorraad details:")
                        print(f"{indent}  • Totale voorraad: {total_stock}")
                        print(f"{indent}  • Gereserveerd: {reserved_stock}")
                        print(f"{indent}  • Vrije voorraad: {free_stock}")
                        print(f"{indent}  • Backorders toegestaan: {'Ja' if allow_backorders else 'Nee'}")
                    else:
                        print(f"{indent}⚠️  Geen voorraad informatie beschikbaar")
                else:
                    print(f"{indent}⚠️  Geen productUuid beschikbaar")
        
        print("\n" + "="*60 + "\n")


def main():
    """Hoofdfunctie"""
    # Configuratie - pas deze waarden aan
    API_KEY = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIxIiwianRpIjoiY2I4NTlkN2M3ZmUwZDc2M2Y5ZDc5NTYzN2I4Mjk1NzJlZGYyZWIxYWJjMTI4ZDgyMjZiMDU5OWMyYmUxMmJiN2ZjNDc1NWE2MzA3NTMyZWEiLCJpYXQiOjE3NjM0ODI4MjMuMTMzMTUyLCJuYmYiOjE3NjM0ODI4MjMuMTMzMTU2LCJleHAiOjE3OTUwMTg4MjMuMDEzNjQ1LCJzdWIiOiI0MjY1Iiwic2NvcGVzIjpbXX0.H3WRVucC1js-726YUS2f0NhK9jviSg9dP499ew8QI406Pr-FpulMTrT9SgcZUaS7YSPEfLPaqUg-S4sABja4rzvgpW9CPlptMrBbxKB2rJbe5GnE0qKIRrIFz_CwbzqYQv6Kl4BHzdP_rX5-ccITRGTqKYipE-7o8vqpZbJyl819DbzGtJf-N2dBuAU78kWbNAZHPJSH7MoDbQWBJ3Kw6A0gDTYwB8Ts2q-yYPolzf2e6EEp6oI3wWqZoQyL05KvLNsAiUv5GHg9FwwvDaYr5pucy_oe-TA1G-Cl0pUCZcwR9J7qd7OriB_QHgeYe_vD6HDobHi6JNA_FOSqOf0Zrf6UbvtBZqalUdcdYiuEn3TcpsHhF2EbAbHE6ORUg6SgEt3IifsjRBnQmksACHhX1e7MpYANZb2gBMZKO94syhCI6LF8Ar6kh8bZvmjlIQCHxlzp4CZgPAzr3zSdPzaDJOzLrFRnFgmPurLerTs3Oe6TgVWdOZJUHMcJXQHWa2j70mSkY6Nd8m_Xei_GbuLLI3TO0nAzKMZ02T9WRg4t-duOTqjQ30UOhkW5In8e1zlLtFRjS2VBSoeGjIj8IK1CdaFG_ePqx_OEPSM2kRDsX9WfG0kcK3QmIuNGwD7t6za3QuDjbjbAVe7aQX8qpIyF-Uw5j9SM8WMae_KmJVpB0xc"  # Je GoedGepickt API key
    ORDER_ID = "802b2103-9695-41ff-a7a2-60fe6b87e466"  # Vervang met het order ID dat je wilt ophalen
    
    # Optioneel: Lees waarden uit command line argumenten
    if len(sys.argv) > 1:
        ORDER_ID = sys.argv[1]
    if len(sys.argv) > 2:
        API_KEY = sys.argv[2]
    
    # Controleer of API key is ingesteld
    if API_KEY == "jouw_api_key_hier":
        print("⚠️  Waarschuwing: Pas eerst je API_KEY aan in het script!")
        print("    Of gebruik: python goedgepickt_order.py <ORDER_ID> <API_KEY>")
        sys.exit(1)
    
    # Initialiseer API client
    api = GoedGepicktAPI(API_KEY)
    
    # Haal order op
    print(f"📦 Order {ORDER_ID} ophalen...")
    order = api.get_order(ORDER_ID)
    
    if order:
        # Print details
        api.print_order_details(order)
        
        # Optioneel: Sla op als JSON bestand
        output_file = f"order_{ORDER_ID}.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(order, f, indent=2, ensure_ascii=False)
        print(f"✅ Order data opgeslagen in: {output_file}")
    else:
        print("❌ Kon order niet ophalen.")
        sys.exit(1)


if __name__ == "__main__":
    main()
